import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, Users, Clock, CheckCircle2, ChevronRight, ListOrdered, Radio } from 'lucide-react';
import { api, startOfToday } from '../api.js';
import { useNow, useToast } from '../context.jsx';
import { Modal } from '../components/Modal.jsx';
import { duration, initials, tokenLabel } from '../format.js';

export function CreateQueueModal({ onClose, onCreated }) {
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    if (busy) return;
    if (!name.trim()) return setError('Give the queue a name, for example “Billing Counter”.');
    setBusy(true);
    setError('');
    try {
      const d = await api('/queues', { method: 'POST', body: { name: name.trim() } });
      onCreated(d.queue);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <Modal title="Create a Queue" onClose={onClose}>
      <form onSubmit={submit} className="stack" noValidate>
        <label className="field">
          <span>Queue name</span>
          <input
            name="queueName"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Billing Counter…"
            maxLength={60}
            autoComplete="off"
            aria-invalid={!!error}
            aria-describedby={error ? 'queue-name-error' : undefined}
          />
          {error && <small id="queue-name-error" className="field-error" role="alert">{error}</small>}
        </label>
        <div className="row-end">
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={busy}>
            {busy && <span className="btn-spinner" aria-hidden="true" />}
            {busy ? 'Creating…' : 'Create Queue'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export default function QueuesPage() {
  const [queues, setQueues] = useState(null);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const navigate = useNavigate();
  const toast = useToast();
  const now = useNow(15000);

  const load = useCallback(async () => {
    try {
      const d = await api(`/queues?since=${startOfToday()}`);
      setQueues(d.queues);
      setError('');
    } catch (err) {
      setError(err.message);
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 10000);
    return () => clearInterval(id);
  }, [load]);

  const totalWaiting = queues?.reduce((s, q) => s + q.waiting, 0) ?? 0;
  const totalServed = queues?.reduce((s, q) => s + q.servedToday, 0) ?? 0;
  const activeCounters = queues?.filter((q) => q.serving).length ?? 0;
  const maxWaiting = Math.max(1, ...(queues?.map((q) => q.waiting) ?? [1]));

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <span className="eyebrow-sm">Overview</span>
          <h1>Your Queues</h1>
          <p className="muted">Pick a queue to call people, reorder the line or issue new tokens.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setCreating(true)}>
          <Plus size={18} aria-hidden="true" /> New Queue
        </button>
      </header>

      {error && <div className="alert" role="alert">{error}. We’ll keep retrying.</div>}

      {queues && queues.length > 0 && (
        <div className="summary-strip">
          <div className="summary-item tone-violet">
            <span className="summary-icon"><Users size={18} aria-hidden="true" /></span>
            <div><b>{totalWaiting}</b><span>People waiting</span></div>
          </div>
          <div className="summary-item tone-green">
            <span className="summary-icon"><Radio size={18} aria-hidden="true" /></span>
            <div><b>{activeCounters}<small>/{queues.length}</small></b><span>Counters serving</span></div>
          </div>
          <div className="summary-item tone-blue">
            <span className="summary-icon"><CheckCircle2 size={18} aria-hidden="true" /></span>
            <div><b>{totalServed}</b><span>Served today</span></div>
          </div>
        </div>
      )}

      {!queues && !error && (
        <div className="grid-cards">
          {[0, 1, 2].map((i) => <div key={i} className="card skeleton" style={{ height: 236 }} />)}
        </div>
      )}

      {queues?.length === 0 && (
        <div className="empty">
          <div className="empty-icon"><ListOrdered size={28} aria-hidden="true" /></div>
          <h2>No queues yet</h2>
          <p className="muted">Create your first queue to start issuing tokens.</p>
          <button className="btn btn-primary" onClick={() => setCreating(true)}><Plus size={18} aria-hidden="true" /> Create a Queue</button>
        </div>
      )}

      {queues?.length > 0 && (
        <div className="grid-cards">
          {queues.map((q, idx) => (
            <Link to={`/queues/${q.id}`} key={q.id} className="card queue-card" style={{ '--i': idx }}>
              <div className="queue-card-head">
                <div className="queue-mono" aria-hidden="true">{initials(q.name)}</div>
                <div className="min-w-0 grow">
                  <h2 className="truncate" title={q.name}>{q.name}</h2>
                  <span className="muted small">{q.waiting === 0 ? 'Queue is clear' : `${q.waiting} in line`}</span>
                </div>
                <ChevronRight size={18} className="queue-card-arrow" aria-hidden="true" />
              </div>

              <div className={`queue-card-serving ${q.serving ? 'is-live' : ''}`}>
                <span className="label">Now serving</span>
                {q.serving ? (
                  <span className="serving-pill">
                    <span className="pulse" aria-hidden="true" />
                    <b>{tokenLabel(q.serving.number)}</b>
                    <span className="truncate">{q.serving.personName}</span>
                  </span>
                ) : (
                  <span className="muted">Nobody at the counter</span>
                )}
              </div>

              <div className="load" aria-hidden="true">
                <span style={{ transform: `scaleX(${q.waiting / maxWaiting})` }} />
              </div>

              <dl className="queue-card-stats">
                <div>
                  <dt><Users size={14} aria-hidden="true" /> Waiting</dt>
                  <dd>{q.waiting}</dd>
                </div>
                <div>
                  <dt><Clock size={14} aria-hidden="true" /> Longest</dt>
                  <dd>{q.oldestWaitingAt ? duration(now - q.oldestWaitingAt) : '—'}</dd>
                </div>
                <div>
                  <dt><CheckCircle2 size={14} aria-hidden="true" /> Served</dt>
                  <dd>{q.servedToday}</dd>
                </div>
              </dl>
            </Link>
          ))}
          <button className="card add-card" onClick={() => setCreating(true)}>
            <span className="add-card-icon"><Plus size={22} aria-hidden="true" /></span>
            <b>New Queue</b>
            <span className="muted small">Set up another counter</span>
          </button>
        </div>
      )}

      {creating && (
        <CreateQueueModal
          onClose={() => setCreating(false)}
          onCreated={(queue) => {
            setCreating(false);
            toast.success(`Queue “${queue.name}” created`);
            navigate(`/queues/${queue.id}`);
          }}
        />
      )}
    </div>
  );
}
