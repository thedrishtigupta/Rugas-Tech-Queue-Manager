import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from './db.js';
import { createApp } from './app.js';
import { seedDemo } from './seed.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 4000;
const DB_FILE = process.env.DB_FILE || path.join(here, '..', 'data', 'queue.db');
const JWT_SECRET = process.env.JWT_SECRET || 'dev-only-secret-change-me';

if (!process.env.JWT_SECRET) {
  console.warn('[warn] JWT_SECRET not set - using an insecure development secret.');
}

const db = openDb(DB_FILE);

// First run: create a demo account with a week of realistic history so the
// dashboard has something to show. Disable with SEED_DEMO=false.
if (process.env.SEED_DEMO !== 'false') {
  const { n } = db.prepare('SELECT COUNT(*) AS n FROM users').get();
  if (n === 0) {
    seedDemo(db);
    console.log('Seeded demo account -> username: demo  password: demo1234');
  }
}

const app = createApp(db, {
  jwtSecret: JWT_SECRET,
  clientDist: path.join(here, '..', '..', 'client', 'dist'),
});

app.listen(PORT, () => {
  console.log(`Queue Manager API listening on http://localhost:${PORT}`);
});
