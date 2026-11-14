import express from 'express';
import { transaction } from '../db.js';
import { HttpError, str, intParam, tsParam, requireAuth } from '../util.js';

const DAY = 24 * 60 * 60 * 1000;
const DEFAULT_SERVICE_MS = 5 * 60 * 1000;

export function serializeToken(t) {
  if (!t) return null;
  return {
    id: t.id,
    queueId: t.queue_id,
    number: t.number,
    personName: t.person_name,
    phone: t.phone,
    status: t.status,
    position: t.position,
    createdAt: t.created_at,
    calledAt: t.called_at,
    completedAt: t.completed_at,
    cancelledAt: t.cancelled_at,
  };
}

export default function queuesRouter(db, secret) {
  const router = express.Router();
  router.use(requireAuth(db, secret));

  const q = {
    list: db.prepare(`
      SELECT q.id, q.name, q.created_at,
        (SELECT COUNT(*) FROM tokens t WHERE t.queue_id = q.id AND t.status = 'waiting') AS waiting,
        (SELECT MIN(t.created_at) FROM tokens t WHERE t.queue_id = q.id AND t.status = 'waiting') AS oldest_waiting,
        (SELECT COUNT(*) FROM tokens t WHERE t.queue_id = q.id AND t.status = 'served' AND t.completed_at >= ?) AS served_since,
        (SELECT AVG(t.called_at - t.created_at) FROM tokens t WHERE t.queue_id = q.id AND t.called_at >= ?) AS avg_wait_since
      FROM queues q WHERE q.user_id = ? ORDER BY q.created_at DESC, q.id DESC`),
    servingForUser: db.prepare(`
      SELECT t.* FROM tokens t JOIN queues q ON q.id = t.queue_id
      WHERE q.user_id = ? AND t.status = 'serving'`),
    get: db.prepare('SELECT * FROM queues WHERE id = ? AND user_id = ?'),
    byName: db.prepare('SELECT id FROM queues WHERE user_id = ? AND name = ? COLLATE NOCASE AND id != ?'),
    insert: db.prepare('INSERT INTO queues (user_id, name, created_at) VALUES (?, ?, ?)'),
    rename: db.prepare('UPDATE queues SET name = ? WHERE id = ?'),
    remove: db.prepare('DELETE FROM queues WHERE id = ?'),
    bumpCounter: db.prepare('UPDATE queues SET token_counter = token_counter + 1 WHERE id = ? RETURNING token_counter'),

    waiting: db.prepare("SELECT * FROM tokens WHERE queue_id = ? AND status = 'waiting' ORDER BY position ASC"),
    serving: db.prepare("SELECT * FROM tokens WHERE queue_id = ? AND status = 'serving' ORDER BY called_at ASC"),
    history: db.prepare(`
      SELECT * FROM tokens WHERE queue_id = ? AND status IN ('served','cancelled')
      ORDER BY COALESCE(completed_at, cancelled_at) DESC LIMIT 12`),
    stats: db.prepare(`
      SELECT
        SUM(CASE WHEN status = 'served' AND completed_at >= ? THEN 1 ELSE 0 END) AS served,
        SUM(CASE WHEN status = 'cancelled' AND cancelled_at >= ? THEN 1 ELSE 0 END) AS cancelled,
        AVG(CASE WHEN called_at >= ? THEN called_at - created_at END) AS avg_wait
      FROM tokens WHERE queue_id = ?`),
    recentService: db.prepare(`
      SELECT AVG(completed_at - called_at) AS avg FROM (
        SELECT completed_at, called_at FROM tokens
        WHERE queue_id = ? AND status = 'served' ORDER BY completed_at DESC LIMIT 20)`),

    token: db.prepare('SELECT * FROM tokens WHERE id = ? AND queue_id = ?'),
    maxPos: db.prepare("SELECT COALESCE(MAX(position), 0) AS p FROM tokens WHERE queue_id = ? AND status = 'waiting'"),
    insertToken: db.prepare(`
      INSERT INTO tokens (queue_id, number, person_name, phone, status, position, created_at)
      VALUES (?, ?, ?, ?, 'waiting', ?, ?) RETURNING *`),
    neighborUp: db.prepare(`
      SELECT * FROM tokens WHERE queue_id = ? AND status = 'waiting' AND position < ?
      ORDER BY position DESC LIMIT 1`),
    neighborDown: db.prepare(`
      SELECT * FROM tokens WHERE queue_id = ? AND status = 'waiting' AND position > ?
      ORDER BY position ASC LIMIT 1`),
    setPos: db.prepare('UPDATE tokens SET position = ? WHERE id = ?'),
    top: db.prepare("SELECT * FROM tokens WHERE queue_id = ? AND status = 'waiting' ORDER BY position ASC LIMIT 1"),
    complete: db.prepare("UPDATE tokens SET status = 'served', completed_at = ? WHERE queue_id = ? AND status = 'serving'"),
    call: db.prepare("UPDATE tokens SET status = 'serving', called_at = ?, position = NULL WHERE id = ? RETURNING *"),
    cancel: db.prepare("UPDATE tokens SET status = 'cancelled', cancelled_at = ?, position = NULL WHERE id = ? RETURNING *"),
  };

  function loadQueue(req) {
    const id = intParam(req.params.id, 'queue id');
    const queue = q.get.get(id, req.user.id);
    if (!queue) throw new HttpError(404, 'Queue not found');
    return queue;
  }

  function queueDetail(queue, since) {
    const waiting = q.waiting.all(queue.id).map(serializeToken);
    const serving = q.serving.all(queue.id).map(serializeToken);
    const history = q.history.all(queue.id).map(serializeToken);
    const s = q.stats.get(since, since, since, queue.id);
    const svc = q.recentService.get(queue.id);
    return {
      queue: { id: queue.id, name: queue.name, createdAt: queue.created_at },
      waiting,
      serving: serving[0] || null,
      history,
      stats: {
        servedToday: s.served || 0,
        cancelledToday: s.cancelled || 0,
        avgWaitMs: s.avg_wait == null ? null : Math.round(s.avg_wait),
        avgServiceMs: svc.avg == null ? DEFAULT_SERVICE_MS : Math.round(svc.avg),
      },
    };
  }

  const sinceOf = (req) => tsParam(req.query.since, Date.now() - DAY);

  // ---- Queues -----------------------------------------------------------

  router.get('/', (req, res) => {
    const since = sinceOf(req);
    const serving = new Map(q.servingForUser.all(req.user.id).map((t) => [t.queue_id, serializeToken(t)]));
    const queues = q.list.all(since, since, req.user.id).map((r) => ({
      id: r.id,
      name: r.name,
      createdAt: r.created_at,
      waiting: r.waiting,
      oldestWaitingAt: r.oldest_waiting,
      servedToday: r.served_since,
      avgWaitMs: r.avg_wait_since == null ? null : Math.round(r.avg_wait_since),
      serving: serving.get(r.id) || null,
    }));
    res.json({ queues });
  });

  router.post('/', (req, res) => {
    const name = str(req.body?.name, 'Queue name', { max: 60 });
    if (q.byName.get(req.user.id, name, 0)) throw new HttpError(409, 'You already have a queue with that name');
    const { lastInsertRowid } = q.insert.run(req.user.id, name, Date.now());
    const queue = q.get.get(Number(lastInsertRowid), req.user.id);
    res.status(201).json(queueDetail(queue, sinceOf(req)));
  });

  router.get('/:id', (req, res) => {
    res.json(queueDetail(loadQueue(req), sinceOf(req)));
  });

  router.patch('/:id', (req, res) => {
    const queue = loadQueue(req);
    const name = str(req.body?.name, 'Queue name', { max: 60 });
    if (q.byName.get(req.user.id, name, queue.id)) throw new HttpError(409, 'You already have a queue with that name');
    q.rename.run(name, queue.id);
    res.json(queueDetail({ ...queue, name }, sinceOf(req)));
  });

  router.delete('/:id', (req, res) => {
    const queue = loadQueue(req);
    q.remove.run(queue.id);
    res.status(204).end();
  });

  // ---- Tokens -----------------------------------------------------------

  router.post('/:id/tokens', (req, res) => {
    const queue = loadQueue(req);
    const personName = str(req.body?.personName, 'Name', { max: 80 });
    const phone = str(req.body?.phone, 'Phone', { max: 20, optional: true });
    if (phone && !/^[0-9+\-() ]{3,20}$/.test(phone)) throw new HttpError(400, 'Phone number looks invalid');

    const token = transaction(db, () => {
      const { token_counter } = q.bumpCounter.get(queue.id);
      const { p } = q.maxPos.get(queue.id);
      return q.insertToken.get(queue.id, token_counter, personName, phone, p + 1, Date.now());
    });
    res.status(201).json({ token: serializeToken(token), ...queueDetail(queue, sinceOf(req)) });
  });

  router.post('/:id/tokens/:tokenId/move', (req, res) => {
    const queue = loadQueue(req);
    const tokenId = intParam(req.params.tokenId, 'token id');
    const direction = req.body?.direction;
    if (direction !== 'up' && direction !== 'down') throw new HttpError(400, "direction must be 'up' or 'down'");

    transaction(db, () => {
      const token = q.token.get(tokenId, queue.id);
      if (!token) throw new HttpError(404, 'Token not found');
      if (token.status !== 'waiting') throw new HttpError(409, 'Only waiting tokens can be moved');
      const neighbor = (direction === 'up' ? q.neighborUp : q.neighborDown).get(queue.id, token.position);
      if (!neighbor) {
        throw new HttpError(409, direction === 'up' ? 'Token is already at the top' : 'Token is already at the bottom');
      }
      q.setPos.run(neighbor.position, token.id);
      q.setPos.run(token.position, neighbor.id);
    });
    res.json(queueDetail(queue, sinceOf(req)));
  });

  router.post('/:id/tokens/:tokenId/cancel', (req, res) => {
    const queue = loadQueue(req);
    const tokenId = intParam(req.params.tokenId, 'token id');
    transaction(db, () => {
      const token = q.token.get(tokenId, queue.id);
      if (!token) throw new HttpError(404, 'Token not found');
      if (token.status !== 'waiting') throw new HttpError(409, `Token is already ${token.status}`);
      q.cancel.get(Date.now(), token.id);
    });
    res.json(queueDetail(queue, sinceOf(req)));
  });

  /** Assign the token at the top of the queue for service.
   *  Any token currently being served is marked as served first. */
  router.post('/:id/serve-next', (req, res) => {
    const queue = loadQueue(req);
    const called = transaction(db, () => {
      const top = q.top.get(queue.id);
      if (!top) throw new HttpError(409, 'The queue is empty');
      const now = Date.now();
      q.complete.run(now, queue.id);
      return q.call.get(now, top.id);
    });
    res.json({ called: serializeToken(called), ...queueDetail(queue, sinceOf(req)) });
  });

  /** Finish the current service without calling anyone else. */
  router.post('/:id/complete', (req, res) => {
    const queue = loadQueue(req);
    const { changes } = q.complete.run(Date.now(), queue.id);
    if (!changes) throw new HttpError(409, 'Nobody is being served right now');
    res.json(queueDetail(queue, sinceOf(req)));
  });

  return router;
}
