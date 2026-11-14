import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT    NOT NULL,
  username      TEXT    NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT    NOT NULL,
  created_at    INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS queues (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name          TEXT    NOT NULL,
  token_counter INTEGER NOT NULL DEFAULT 0,
  created_at    INTEGER NOT NULL
);

-- status lifecycle: waiting -> serving -> served
--                   waiting -> cancelled
CREATE TABLE IF NOT EXISTS tokens (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  queue_id     INTEGER NOT NULL REFERENCES queues(id) ON DELETE CASCADE,
  number       INTEGER NOT NULL,
  person_name  TEXT    NOT NULL,
  phone        TEXT,
  status       TEXT    NOT NULL CHECK (status IN ('waiting','serving','served','cancelled')),
  position     INTEGER,
  created_at   INTEGER NOT NULL,
  called_at    INTEGER,
  completed_at INTEGER,
  cancelled_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_queues_user     ON queues(user_id);
CREATE INDEX IF NOT EXISTS idx_tokens_queue    ON tokens(queue_id, status, position);
CREATE INDEX IF NOT EXISTS idx_tokens_created  ON tokens(created_at);
`;

export function openDb(file) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA foreign_keys = ON;');
  if (file !== ':memory:') db.exec('PRAGMA journal_mode = WAL;');
  db.exec(SCHEMA);
  return db;
}

/** Run fn inside a transaction; rolls back on any thrown error. */
export function transaction(db, fn) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}
