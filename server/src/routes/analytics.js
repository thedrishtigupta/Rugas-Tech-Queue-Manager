import express from 'express';
import { HttpError, intParam, requireAuth } from '../util.js';

const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

// bucket = chart x-axis step; samples = how many times per bucket the queue
// length is sampled to compute its average/peak.
const RANGES = {
  '24h': { size: HOUR, count: 24 },
  '7d': { size: 6 * HOUR, count: 28 },
  '30d': { size: DAY, count: 30 },
};
const SAMPLES_PER_BUCKET = 30;

const WAIT_BINS = [
  { label: '< 5 min', max: 5 * MIN },
  { label: '5–10 min', max: 10 * MIN },
  { label: '10–20 min', max: 20 * MIN },
  { label: '20–30 min', max: 30 * MIN },
  { label: '30–60 min', max: 60 * MIN },
  { label: '60+ min', max: Infinity },
];

function percentile(sorted, p) {
  if (!sorted.length) return null;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}
const mean = (arr) => (arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : null);

/** Floor a timestamp to a bucket boundary in the viewer's local time. */
function floorLocal(ts, size, tzOffsetMs) {
  return Math.floor((ts + tzOffsetMs) / size) * size - tzOffsetMs;
}

export function computeAnalytics(tokens, queues, { range, now, tzOffsetMin }) {
  const { size, count } = RANGES[range];
  // Day-sized buckets must line up with local midnight; the client sends
  // Date#getTimezoneOffset() (minutes, positive west of UTC).
  const tzOffsetMs = -tzOffsetMin * MIN;
  const end = floorLocal(now, size, tzOffsetMs) + size;
  const start = end - count * size;

  const exitOf = (t) => t.called_at ?? t.cancelled_at ?? null;

  // ---- Buckets ------------------------------------------------------------
  const buckets = Array.from({ length: count }, (_, i) => ({
    start: start + i * size,
    arrivals: 0,
    served: 0,
    cancelled: 0,
    waitSum: 0,
    waitCount: 0,
    avgLength: 0,
    peakLength: 0,
  }));
  const bucketOf = (ts) => {
    if (ts == null || ts < start || ts >= end) return null;
    return buckets[Math.floor((ts - start) / size)];
  };

  for (const t of tokens) {
    const b1 = bucketOf(t.created_at);
    if (b1) b1.arrivals++;
    const b2 = bucketOf(t.called_at);
    if (b2) {
      b2.waitSum += t.called_at - t.created_at;
      b2.waitCount++;
    }
    const b3 = bucketOf(t.completed_at);
    if (b3) b3.served++;
    const b4 = bucketOf(t.cancelled_at);
    if (b4) b4.cancelled++;
  }

  // ---- Queue length over time: sweep line over join/leave events -----------
  const events = [];
  for (const t of tokens) {
    events.push([t.created_at, +1]);
    const exit = exitOf(t);
    if (exit != null) events.push([exit, -1]);
  }
  events.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  let ei = 0;
  let length = 0;
  const step = size / SAMPLES_PER_BUCKET;
  for (const b of buckets) {
    let sum = 0;
    let n = 0;
    let peak = 0;
    for (let s = 0; s < SAMPLES_PER_BUCKET; s++) {
      const at = b.start + (s + 1) * step;
      if (at > now) break; // do not extrapolate into the future
      while (ei < events.length && events[ei][0] <= at) length += events[ei++][1];
      sum += length;
      n++;
      peak = Math.max(peak, length);
    }
    b.avgLength = n ? Math.round((sum / n) * 10) / 10 : null;
    b.peakLength = n ? peak : null;
  }

  // ---- KPIs ---------------------------------------------------------------
  const inRange = (ts) => ts != null && ts >= start && ts <= now;
  const waits = tokens.filter((t) => inRange(t.called_at)).map((t) => t.called_at - t.created_at).sort((a, b) => a - b);
  const services = tokens
    .filter((t) => t.status === 'served' && inRange(t.completed_at))
    .map((t) => t.completed_at - t.called_at);
  const created = tokens.filter((t) => inRange(t.created_at));
  const cancelled = tokens.filter((t) => t.status === 'cancelled' && inRange(t.cancelled_at));
  const servedCount = services.length;
  const waitingNow = tokens.filter((t) => t.status === 'waiting');
  const longestWaitNow = waitingNow.length ? now - Math.min(...waitingNow.map((t) => t.created_at)) : null;

  const peakBucket = buckets.reduce((best, b) => (b.peakLength != null && b.peakLength > (best?.peakLength ?? -1) ? b : best), null);

  // ---- Distribution of waits ---------------------------------------------
  const distribution = WAIT_BINS.map((bin) => ({ label: bin.label, count: 0 }));
  for (const w of waits) {
    const i = WAIT_BINS.findIndex((bin) => w < bin.max);
    distribution[i].count++;
  }

  // ---- Per-queue breakdown -----------------------------------------------
  const perQueue = queues.map((qu) => {
    const own = tokens.filter((t) => t.queue_id === qu.id);
    const ownWaits = own.filter((t) => inRange(t.called_at)).map((t) => t.called_at - t.created_at);
    return {
      id: qu.id,
      name: qu.name,
      waitingNow: own.filter((t) => t.status === 'waiting').length,
      tokens: own.filter((t) => inRange(t.created_at)).length,
      served: own.filter((t) => t.status === 'served' && inRange(t.completed_at)).length,
      cancelled: own.filter((t) => t.status === 'cancelled' && inRange(t.cancelled_at)).length,
      avgWaitMs: mean(ownWaits),
    };
  });

  return {
    range,
    bucketSize: size,
    start,
    end,
    kpis: {
      totalTokens: created.length,
      served: servedCount,
      cancelled: cancelled.length,
      cancellationRate: created.length ? cancelled.length / created.length : null,
      waitingNow: waitingNow.length,
      servingNow: tokens.filter((t) => t.status === 'serving').length,
      longestWaitNowMs: longestWaitNow,
      avgWaitMs: mean(waits),
      medianWaitMs: percentile(waits, 50),
      p90WaitMs: percentile(waits, 90),
      avgServiceMs: mean(services),
      peakLength: peakBucket?.peakLength ?? 0,
      peakAt: peakBucket && peakBucket.peakLength > 0 ? peakBucket.start : null,
    },
    series: buckets.map((b) => ({
      t: b.start,
      arrivals: b.arrivals,
      served: b.served,
      cancelled: b.cancelled,
      avgWaitMin: b.waitCount ? Math.round((b.waitSum / b.waitCount / MIN) * 10) / 10 : null,
      avgLength: b.avgLength,
      peakLength: b.peakLength,
    })),
    distribution,
    perQueue,
  };
}

export default function analyticsRouter(db, secret) {
  const router = express.Router();
  router.use(requireAuth(db, secret));

  const queuesOf = db.prepare('SELECT id, name FROM queues WHERE user_id = ? ORDER BY name COLLATE NOCASE');
  // Every token that could matter for the window: created before the end and
  // either still in the system or left after the window start.
  const tokensOf = db.prepare(`
    SELECT t.* FROM tokens t JOIN queues q ON q.id = t.queue_id
    WHERE q.user_id = ? AND t.created_at < ?
      AND (t.status IN ('waiting','serving')
           OR COALESCE(t.completed_at, t.cancelled_at, t.called_at) >= ?)`);

  router.get('/', (req, res) => {
    const range = req.query.range || '24h';
    if (!RANGES[range]) throw new HttpError(400, 'range must be one of 24h, 7d, 30d');
    const tzOffsetMin = req.query.tz === undefined ? 0 : Number(req.query.tz);
    if (!Number.isFinite(tzOffsetMin) || Math.abs(tzOffsetMin) > 14 * 60) throw new HttpError(400, 'Invalid tz');

    let queues = queuesOf.all(req.user.id);
    if (req.query.queueId) {
      const id = intParam(req.query.queueId, 'queue id');
      queues = queues.filter((qu) => qu.id === id);
      if (!queues.length) throw new HttpError(404, 'Queue not found');
    }
    const ids = new Set(queues.map((qu) => qu.id));
    const now = Date.now();
    const { size, count } = RANGES[range];
    const lookback = now - (count + 1) * size;
    const tokens = tokensOf.all(req.user.id, now + 1, lookback).filter((t) => ids.has(t.queue_id));

    res.json(computeAnalytics(tokens, queues, { range, now, tzOffsetMin }));
  });

  return router;
}
