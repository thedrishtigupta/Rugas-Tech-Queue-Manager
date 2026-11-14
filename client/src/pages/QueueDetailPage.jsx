import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowDown, ArrowLeft, ArrowUp, BellRing, Check, Clock, Pencil, Phone, Trash2, UserPlus, Users, X, History, BarChart3,
} from 'lucide-react';
import { api, startOfToday } from '../api.js';
import { useNow, useToast } from '../context.jsx';
import { ConfirmDialog, Modal } from '../components/Modal.jsx';
import { clock, duration, initials, tokenLabel } from '../format.js';

export default function QueueDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const now = useNow(1000);

  const [data, setData] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [busy, setBusy] = useState(null); // key of the action in flight
  const [confirm, setConfirm] = useState(null);
  const [renaming, setRenaming] = useState(false);
  const [form, setForm] = useState({ personName: '', phone: '' });
  const [formError, setFormError] = useState('');
  const [flashId, setFlashId] = useState(null);
  const nameInput = useRef(null);

  // Responses can arrive out of order (poll vs. action); only apply the newest.
  const seq = useRef(0);
  const applied = useRef(0);
  const apply = useCallback((reqId, d) => {
    if (reqId < applied.current) return;
    applied.current = reqId;
    setData(d);
  }, []);

  const load = useCallback(async () => {
    const reqId = ++seq.current;
    try {
      apply(reqId, await api(`/queues/${id}?since=${startOfToday()}`));
      setLoadError('');
    } catch (err) {
      if (reqId >= applied.current) setLoadError(err.message);
    }
  }, [id, apply]);

  useEffect(() => {
    setData(null);
    setLoadError('');
    seq.current = 0;
    applied.current = 0;
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [load]);

  async function act(key, path, { method = 'POST', body, success } = {}) {
    if (busy) return null;
    setBusy(key);
    const reqId = ++seq.current;
    try {
      const d = await api(`/queues/${id}${path}?since=${startOfToday()}`, { method, body });
      if (d) apply(reqId, d);
      if (success) toast.success(typeof success === 'function' ? success(d) : success);
      return d ?? {}; // DELETE returns no body; still signal success
    } catch (err) {
      toast.error(err.message);
      load(); // resync in case someone else changed the queue
      return null;
    } finally {
      setBusy(null);
    }
  }

  async function addToken(e) {
    e.preventDefault();
    if (!form.personName.trim()) {
      setFormError('Enter a name');
      nameInput.current?.focus();
      return;
    }
    setFormError('');
    const d = await act('add', '/tokens', {
      body: { personName: form.personName.trim(), phone: form.phone.trim() || undefined },
      success: (r) => `Token ${tokenLabel(r.token.number)} issued to ${r.token.personName}`,
    });
    if (d) {
      setForm({ personName: '', phone: '' });
      setFlashId(d.token.id);
      nameInput.current?.focus();
    }
  }

  const callNext = () =>
    act('next', '/serve-next', { success: (d) => `Now serving ${tokenLabel(d.called.number)} · ${d.called.personName}` });

  if (loadError && !data) {
    return (
      <div className="page">
        <div className="empty">
          <h3>{loadError}</h3>
          <Link className="btn btn-secondary" to="/queues"><ArrowLeft size={16} /> Back to queues</Link>
        </div>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="page">
        <div className="card skeleton" style={{ height: 80, marginBottom: 20 }} />
        <div className="detail-grid">
          <div className="card skeleton" style={{ height: 320 }} />
          <div className="card skeleton" style={{ height: 420 }} />
        </div>
      </div>
    );
  }

  const { queue, waiting, serving, history, stats } = data;
  const avgService = stats.avgServiceMs;
  const remainingCurrent = serving ? Math.max(avgService - (now - serving.calledAt), 0) : 0;
  const next = waiting[0];

  return (
    <div className="page">
      <header className="page-head">
        <div className="min-w-0">
          <Link to="/queues" className="back-link"><ArrowLeft size={16} /> All queues</Link>
          <div className="title-row">
            <h1 className="truncate">{queue.name}</h1>
            <button className="icon-btn ghost" onClick={() => setRenaming(true)} title="Rename queue" aria-label="Rename queue">
              <Pencil size={16} />
            </button>
          </div>
        </div>
        <div className="head-actions">
          <Link className="btn btn-secondary" to={`/dashboard?queueId=${queue.id}`}>
            <BarChart3 size={16} /> Analytics
          </Link>
          <button
            className="btn btn-ghost-danger"
            onClick={() =>
              setConfirm({
                title: 'Delete this queue?',
                message: `“${queue.name}” and all of its tokens and history will be permanently removed.`,
                confirmLabel: 'Delete queue',
                run: async () => {
                  const ok = await act('delete', '', { method: 'DELETE' });
                  if (ok) {
                    toast.success(`Queue “${queue.name}” deleted`);
                    navigate('/queues');
                  }
                },
              })
            }
          >
            <Trash2 size={16} /> Delete
          </button>
        </div>
      </header>

      {loadError && <div className="alert">Connection problem: {loadError}. Retrying…</div>}

      <div className="stat-strip">
        <Stat icon={Users} label="Waiting" value={waiting.length} />
        <Stat icon={Check} label="Served today" value={stats.servedToday} />
        <Stat icon={X} label="Cancelled today" value={stats.cancelledToday} />
        <Stat icon={Clock} label="Avg wait today" value={duration(stats.avgWaitMs)} />
      </div>

      <div className="detail-grid">
        {/* ---------------- Left column: now serving + add token ---------------- */}
        <div className="stack">
          <section className={`card serving-card ${serving ? 'is-active' : ''}`}>
            <div className="serving-head">
              <span className="label">Now serving</span>
              {serving && <span className="live"><span className="pulse" /> Live</span>}
            </div>
            {serving ? (
              <>
                <div className="serving-number">{tokenLabel(serving.number)}</div>
                <div className="serving-name">{serving.personName}</div>
                <div className="serving-meta">
                  <span><Clock size={14} /> In service {duration(now - serving.calledAt, { seconds: true })}</span>
                  <span>Waited {duration(serving.calledAt - serving.createdAt)}</span>
                </div>
              </>
            ) : (
              <div className="serving-empty">
                <BellRing size={28} />
                <p>{waiting.length ? 'Ready to call the next person.' : 'Nobody waiting right now.'}</p>
              </div>
            )}

            <button className="btn btn-primary btn-lg btn-block" onClick={callNext} disabled={!next || !!busy}>
              <BellRing size={18} />
              {busy === 'next' ? 'Calling…' : next ? `Call next · ${tokenLabel(next.number)} ${next.personName}` : 'Queue is empty'}
            </button>
            {serving && (
              <button
                className="btn btn-secondary btn-block"
                onClick={() => act('complete', '/complete', { success: `${tokenLabel(serving.number)} marked as served` })}
                disabled={!!busy}
              >
                <Check size={16} /> Finish without calling next
              </button>
            )}
          </section>

          <section className="card">
            <h2 className="card-title"><UserPlus size={18} /> Add to queue</h2>
            <form onSubmit={addToken} className="stack" noValidate>
              <label className="field">
                <span>Name</span>
                <input
                  ref={nameInput}
                  value={form.personName}
                  onChange={(e) => setForm((f) => ({ ...f, personName: e.target.value }))}
                  placeholder="Person’s name"
                  maxLength={80}
                />
              </label>
              <label className="field">
                <span>Phone <em className="muted">(optional)</em></span>
                <input
                  value={form.phone}
                  onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                  placeholder="+91 98765 43210"
                  inputMode="tel"
                  maxLength={20}
                />
              </label>
              {formError && <div className="alert">{formError}</div>}
              <button className="btn btn-primary btn-block" disabled={!!busy}>
                <UserPlus size={16} /> {busy === 'add' ? 'Adding…' : 'Issue token'}
              </button>
            </form>
          </section>
        </div>

        {/* ---------------- Right column: waiting list + history ---------------- */}
        <div className="stack">
          <section className="card card-flush">
            <div className="list-head">
              <h2 className="card-title"><Users size={18} /> Waiting <span className="count">{waiting.length}</span></h2>
              <span className="muted small">Est. {duration(avgService)} per person</span>
            </div>

            {waiting.length === 0 ? (
              <div className="empty small-empty">
                <p className="muted">The queue is empty. Add someone using the form.</p>
              </div>
            ) : (
              <ol className="token-list">
                {waiting.map((t, i) => (
                  <li key={t.id} className={`token-row ${i === 0 ? 'is-next' : ''} ${flashId === t.id ? 'flash' : ''}`}>
                    <div className="token-pos">{i + 1}</div>
                    <div className="token-badge">{tokenLabel(t.number)}</div>
                    <div className="token-main">
                      <div className="token-name">
                        <span className="avatar sm">{initials(t.personName)}</span>
                        <span className="truncate">{t.personName}</span>
                        {i === 0 && <span className="tag">Next</span>}
                      </div>
                      <div className="token-meta">
                        <span title={`Joined at ${clock(t.createdAt)}`}><Clock size={13} /> Waiting {duration(now - t.createdAt)}</span>
                        <span>ETA ~{duration(remainingCurrent + i * avgService)}</span>
                        {t.phone && <span className="hide-sm"><Phone size={13} /> {t.phone}</span>}
                      </div>
                    </div>
                    <div className="token-actions">
                      <button
                        className="icon-btn"
                        title="Move up"
                        aria-label={`Move ${t.personName} up`}
                        disabled={i === 0 || !!busy}
                        onClick={() => act(`up-${t.id}`, `/tokens/${t.id}/move`, { body: { direction: 'up' } })}
                      >
                        <ArrowUp size={16} />
                      </button>
                      <button
                        className="icon-btn"
                        title="Move down"
                        aria-label={`Move ${t.personName} down`}
                        disabled={i === waiting.length - 1 || !!busy}
                        onClick={() => act(`down-${t.id}`, `/tokens/${t.id}/move`, { body: { direction: 'down' } })}
                      >
                        <ArrowDown size={16} />
                      </button>
                      <button
                        className="icon-btn danger"
                        title="Cancel token"
                        aria-label={`Cancel token for ${t.personName}`}
                        disabled={!!busy}
                        onClick={() =>
                          setConfirm({
                            title: `Cancel ${tokenLabel(t.number)}?`,
                            message: `${t.personName} will be removed from the queue. This can’t be undone.`,
                            confirmLabel: 'Cancel token',
                            run: () => act(`cancel-${t.id}`, `/tokens/${t.id}/cancel`, { success: `${tokenLabel(t.number)} cancelled` }),
                          })
                        }
                      >
                        <X size={16} />
                      </button>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </section>

          <section className="card card-flush">
            <div className="list-head">
              <h2 className="card-title"><History size={18} /> Recent activity</h2>
            </div>
            {history.length === 0 ? (
              <div className="empty small-empty"><p className="muted">Served and cancelled tokens will appear here.</p></div>
            ) : (
              <ul className="history-list">
                {history.map((t) => (
                  <li key={t.id}>
                    <span className={`status-dot ${t.status}`} aria-hidden />
                    <span className="token-badge sm">{tokenLabel(t.number)}</span>
                    <span className="truncate grow">{t.personName}</span>
                    <span className={`status-text ${t.status}`}>{t.status === 'served' ? 'Served' : 'Cancelled'}</span>
                    <span className="muted small nowrap">
                      {t.status === 'served'
                        ? `waited ${duration(t.calledAt - t.createdAt)}`
                        : `after ${duration(t.cancelledAt - t.createdAt)}`}
                    </span>
                    <span className="muted small nowrap hide-sm">{clock(t.completedAt ?? t.cancelledAt)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>

      {confirm && (
        <ConfirmDialog
          {...confirm}
          danger
          busy={!!busy}
          onClose={() => setConfirm(null)}
          onConfirm={async () => {
            await confirm.run();
            setConfirm(null);
          }}
        />
      )}

      {renaming && (
        <RenameModal
          initial={queue.name}
          onClose={() => setRenaming(false)}
          onSave={async (name) => {
            const d = await act('rename', '', { method: 'PATCH', body: { name }, success: 'Queue renamed' });
            if (d) setRenaming(false);
          }}
          busy={busy === 'rename'}
        />
      )}
    </div>
  );
}

function Stat({ icon: Icon, label, value }) {
  return (
    <div className="stat">
      <div className="stat-icon"><Icon size={18} /></div>
      <div>
        <div className="stat-value">{value}</div>
        <div className="stat-label">{label}</div>
      </div>
    </div>
  );
}

function RenameModal({ initial, onClose, onSave, busy }) {
  const [name, setName] = useState(initial);
  return (
    <Modal title="Rename queue" onClose={onClose}>
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim() && !busy) onSave(name.trim());
        }}
      >
        <label className="field">
          <span>Queue name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
        </label>
        <div className="row-end">
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={busy || !name.trim()}>{busy ? 'Saving…' : 'Save'}</button>
        </div>
      </form>
    </Modal>
  );
}
