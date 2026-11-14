import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, Users, Clock, CheckCircle2, ChevronRight, ListOrdered } from 'lucide-react';
import { api, startOfToday } from '../api.js';
import { useNow, useToast } from '../context.jsx';
import { Modal } from '../components/Modal.jsx';
import { duration, tokenLabel } from '../format.js';

export function CreateQueueModal({ onClose, onCreated }) {
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    if (busy) return;
    if (!name.trim()) return setError('Give the queue a name');
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
    <Modal title="Create a queue" onClose={onClose}>
      <form onSubmit={submit} className="stack">
        <label className="field">
          <span>Queue name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Billing Counter"
            maxLength={60}
          />
        </label>
        {error && <div className="alert">{error}</div>}
        <div className="row-end">
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={busy}>{busy ? 'Creating…' : 'Create queue'}</button>
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

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Queues</h1>
          <p className="muted">
            {queues ? `${queues.length} queue${queues.length === 1 ? '' : 's'} · ${totalWaiting} people waiting` : 'Loading…'}
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => setCreating(true)}>
          <Plus size={18} /> New queue
        </button>
      </header>

      {error && <div className="alert">{error}</div>}

      {!queues && !error && (
        <div className="grid-cards">
          {[0, 1, 2].map((i) => <div key={i} className="card skeleton" style={{ height: 190 }} />)}
        </div>
      )}

      {queues?.length === 0 && (
        <div className="empty">
          <div className="empty-icon"><ListOrdered size={28} /></div>
          <h3>No queues yet</h3>
          <p className="muted">Create your first queue to start issuing tokens.</p>
          <button className="btn btn-primary" onClick={() => setCreating(true)}><Plus size={18} /> Create a queue</button>
        </div>
      )}

      {queues?.length > 0 && (
        <div className="grid-cards">
          {queues.map((q) => (
            <Link to={`/queues/${q.id}`} key={q.id} className="card queue-card">
              <div className="queue-card-head">
                <h3>{q.name}</h3>
                <ChevronRight size={18} className="muted" />
              </div>
              <div className="queue-card-serving">
                <span className="label">Now serving</span>
                {q.serving ? (
                  <span className="serving-pill">
                    <span className="pulse" /> {tokenLabel(q.serving.number)} · {q.serving.personName}
                  </span>
                ) : (
                  <span className="muted">Nobody</span>
                )}
              </div>
              <div className="queue-card-stats">
                <div>
                  <Users size={15} />
                  <b>{q.waiting}</b>
                  <span>waiting</span>
                </div>
                <div>
                  <Clock size={15} />
                  <b>{q.oldestWaitingAt ? duration(now - q.oldestWaitingAt) : '—'}</b>
                  <span>longest wait</span>
                </div>
                <div>
                  <CheckCircle2 size={15} />
                  <b>{q.servedToday}</b>
                  <span>served today</span>
                </div>
              </div>
            </Link>
          ))}
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
