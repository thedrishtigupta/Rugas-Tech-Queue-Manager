import express from 'express';
import bcrypt from 'bcryptjs';
import { HttpError, str, signToken, requireAuth } from '../util.js';

export default function authRouter(db, secret) {
  const router = express.Router();
  const byUsername = db.prepare('SELECT * FROM users WHERE username = ?');
  const insertUser = db.prepare(
    'INSERT INTO users (name, username, password_hash, created_at) VALUES (?, ?, ?, ?)'
  );

  const publicUser = (u) => ({ id: u.id, name: u.name, username: u.username });

  router.post('/register', (req, res) => {
    const body = req.body || {};
    const name = str(body.name, 'Name', { max: 60 });
    const username = str(body.username, 'Username', { min: 3, max: 30 });
    if (!/^[a-zA-Z0-9_.-]+$/.test(username)) {
      throw new HttpError(400, 'Username may only contain letters, numbers, dot, dash and underscore');
    }
    if (typeof body.password !== 'string' || body.password.length < 6 || body.password.length > 100) {
      throw new HttpError(400, 'Password must be 6-100 characters');
    }
    if (byUsername.get(username)) throw new HttpError(409, 'That username is already taken');

    const hash = bcrypt.hashSync(body.password, 10);
    const { lastInsertRowid } = insertUser.run(name, username, hash, Date.now());
    const user = { id: Number(lastInsertRowid), name, username };
    res.status(201).json({ token: signToken(user, secret), user });
  });

  router.post('/login', (req, res) => {
    const body = req.body || {};
    if (typeof body.username !== 'string' || typeof body.password !== 'string') {
      throw new HttpError(400, 'Username and password are required');
    }
    const user = byUsername.get(body.username.trim());
    if (!user || !bcrypt.compareSync(body.password, user.password_hash)) {
      throw new HttpError(401, 'Invalid username or password');
    }
    res.json({ token: signToken(user, secret), user: publicUser(user) });
  });

  router.get('/me', requireAuth(db, secret), (req, res) => {
    res.json({ user: req.user });
  });

  return router;
}
