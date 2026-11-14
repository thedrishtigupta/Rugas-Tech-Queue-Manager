import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import authRouter from './routes/auth.js';
import queuesRouter from './routes/queues.js';
import analyticsRouter from './routes/analytics.js';

export function createApp(db, { jwtSecret, clientDist } = {}) {
  if (!jwtSecret) throw new Error('jwtSecret is required');
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '100kb' }));

  app.get('/api/health', (_req, res) => res.json({ ok: true }));
  app.use('/api/auth', authRouter(db, jwtSecret));
  app.use('/api/queues', queuesRouter(db, jwtSecret));
  app.use('/api/analytics', analyticsRouter(db, jwtSecret));
  app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }));

  // Serve the built React app in production.
  if (clientDist && fs.existsSync(path.join(clientDist, 'index.html'))) {
    app.use(express.static(clientDist));
    app.get('*', (_req, res) => res.sendFile(path.join(clientDist, 'index.html')));
  }

  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON body' });
    if (err.status && err.status < 500) return res.status(err.status).json({ error: err.message });
    console.error(err);
    res.status(500).json({ error: 'Something went wrong on the server' });
  });

  return app;
}
