import bcrypt from 'bcryptjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb, transaction } from './db.js';

const MIN = 60 * 1000;
const DAY = 24 * 60 * MIN;

const FIRST = ['Aarav', 'Diya', 'Kabir', 'Ananya', 'Rohan', 'Isha', 'Vivaan', 'Meera', 'Arjun', 'Sara', 'Neha',
  'Rahul', 'Priya', 'Aditya', 'Kavya', 'Ishaan', 'Tara', 'Dev', 'Riya', 'Nikhil', 'Pooja', 'Karan', 'Sneha', 'Varun'];
const LAST = ['Sharma', 'Verma', 'Gupta', 'Iyer', 'Nair', 'Reddy', 'Kapoor', 'Mehta', 'Singh', 'Das', 'Joshi', 'Rao'];

// Deterministic PRNG so the demo looks the same every time.
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const QUEUES = [
  { name: 'General Enquiry', perHour: 7, serviceMin: [4, 9] },
  { name: 'Billing Counter', perHour: 9, serviceMin: [3, 7] },
  { name: 'Pharmacy', perHour: 5, serviceMin: [5, 12] },
];

/**
 * Simulate a single-server queue for each demo queue over the last 7 days
 * (open 09:00-19:00 local time) and store the results.
 */
export function seedDemo(db, { now = Date.now() } = {}) {
  const rand = rng(42);
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];
  const between = (a, b) => a + rand() * (b - a);
  const phone = () => `+91 9${String(Math.floor(rand() * 1e9)).padStart(9, '0')}`;

  transaction(db, () => {
    const userId = Number(
      db.prepare('INSERT INTO users (name, username, password_hash, created_at) VALUES (?, ?, ?, ?)')
        .run('Demo Manager', 'demo', bcrypt.hashSync('demo1234', 10), now - 8 * DAY).lastInsertRowid
    );
    const insQueue = db.prepare('INSERT INTO queues (user_id, name, created_at) VALUES (?, ?, ?)');
    const insToken = db.prepare(`
      INSERT INTO tokens (queue_id, number, person_name, phone, status, position, created_at, called_at, completed_at, cancelled_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    const setCounter = db.prepare('UPDATE queues SET token_counter = ? WHERE id = ?');

    QUEUES.forEach((cfg, qi) => {
      const queueId = Number(insQueue.run(userId, cfg.name, now - 8 * DAY + qi * MIN).lastInsertRowid);
      const rows = [];

      for (let d = 7; d >= 0; d--) {
        const day = new Date(now - d * DAY);
        day.setHours(9, 0, 0, 0);
        const open = day.getTime();
        const close = open + 10 * 60 * MIN;
        let t = open;
        let serverFree = open;
        while (true) {
          // Busier around midday: rate multiplier peaks at 13:00.
          const hour = (t - open) / (60 * MIN) + 9;
          const rate = cfg.perHour * (0.55 + 0.9 * Math.exp(-((hour - 13) ** 2) / 6));
          t += (-Math.log(1 - rand()) / rate) * 60 * MIN;
          if (t >= close || t > now) break;

          const service = between(...cfg.serviceMin) * MIN;
          const patience = between(20, 70) * MIN;
          const callAt = Math.max(t, serverFree);
          const row = { created: Math.round(t), name: `${pick(FIRST)} ${pick(LAST)}`, phone: rand() < 0.7 ? phone() : null };

          const leaves = callAt - t > patience || rand() < 0.04;
          const cancelAt = Math.round(Math.min(t + patience, callAt, t + between(2, 40) * MIN));
          if (leaves && cancelAt <= now) {
            Object.assign(row, { status: 'cancelled', cancelled: cancelAt });
          } else if (callAt > now) {
            row.status = 'waiting';
            serverFree = callAt + service;
          } else {
            const done = callAt + service;
            Object.assign(row, { called: Math.round(callAt), status: done <= now ? 'served' : 'serving' });
            if (done <= now) row.completed = Math.round(done);
            serverFree = done;
          }
          rows.push(row);
        }
      }

      // Make sure there is something live to manage whatever time it is.
      // Extra arrivals join after everyone simulated so far (keeps FIFO order).
      const waitingCount = rows.filter((r) => r.status === 'waiting').length;
      const missing = Math.max(0, 3 + qi - waitingCount);
      const lastCreated = rows.length ? rows[rows.length - 1].created : now - 30 * MIN;
      const from = Math.max(lastCreated, now - 30 * MIN);
      for (let i = 1; i <= missing; i++) {
        const created = Math.round(from + ((now - from) * i) / (missing + 1));
        rows.push({ created, name: `${pick(FIRST)} ${pick(LAST)}`, phone: phone(), status: 'waiting' });
      }
      rows.sort((a, b) => a.created - b.created);

      let pos = 0;
      rows.forEach((r, i) => {
        insToken.run(queueId, i + 1, r.name, r.phone, r.status, r.status === 'waiting' ? ++pos : null,
          r.created, r.called ?? null, r.completed ?? null, r.cancelled ?? null);
      });
      setCounter.run(rows.length, queueId);
    });
  });
}

// `npm run seed` -> wipe the database and reseed.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const db = openDb(process.env.DB_FILE || path.join(here, '..', 'data', 'queue.db'));
  if (process.argv.includes('--reset')) db.exec("DELETE FROM tokens; DELETE FROM queues; DELETE FROM users; DELETE FROM sqlite_sequence;");
  seedDemo(db);
  console.log('Seeded demo account -> username: demo  password: demo1234');
}
