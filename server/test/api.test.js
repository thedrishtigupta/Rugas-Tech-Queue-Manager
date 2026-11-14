import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../src/db.js';
import { createApp } from '../src/app.js';
import { seedDemo } from '../src/seed.js';

let server;
let base;

before(async () => {
  const db = openDb(':memory:');
  seedDemo(db);
  const app = createApp(db, { jwtSecret: 'test-secret' });
  await new Promise((resolve) => {
    server = app.listen(0, resolve);
  });
  base = `http://127.0.0.1:${server.address().port}/api`;
});

after(() => server.close());

async function call(method, path, { token, body } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, data: text ? JSON.parse(text) : null };
}

async function register(username) {
  const r = await call('POST', '/auth/register', { body: { name: 'Test', username, password: 'secret123' } });
  assert.equal(r.status, 201);
  return r.data.token;
}

test('auth: register, login, me, bad credentials, duplicate username', async () => {
  const token = await register('alice');
  const me = await call('GET', '/auth/me', { token });
  assert.equal(me.data.user.username, 'alice');

  assert.equal((await call('POST', '/auth/login', { body: { username: 'ALICE', password: 'secret123' } })).status, 200);
  assert.equal((await call('POST', '/auth/login', { body: { username: 'alice', password: 'nope' } })).status, 401);
  assert.equal((await call('POST', '/auth/register', { body: { name: 'X', username: 'alice', password: 'secret123' } })).status, 409);
  assert.equal((await call('POST', '/auth/register', { body: { name: 'X', username: 'bob', password: '123' } })).status, 400);
  assert.equal((await call('GET', '/queues')).status, 401);
  assert.equal((await call('GET', '/queues', { token: 'garbage' })).status, 401);
});

test('demo login works', async () => {
  const r = await call('POST', '/auth/login', { body: { username: 'demo', password: 'demo1234' } });
  assert.equal(r.status, 200);
  const list = await call('GET', '/queues', { token: r.data.token });
  assert.equal(list.data.queues.length, 3);
});

test('queue lifecycle: create, add, move, serve, cancel, complete', async () => {
  const token = await register('carol');
  const created = await call('POST', '/queues', { token, body: { name: '  Front Desk  ' } });
  assert.equal(created.status, 201);
  assert.equal(created.data.queue.name, 'Front Desk');
  const id = created.data.queue.id;

  assert.equal((await call('POST', '/queues', { token, body: { name: 'front desk' } })).status, 409);
  assert.equal((await call('POST', '/queues', { token, body: { name: '   ' } })).status, 400);

  // Empty queue cannot serve
  assert.equal((await call('POST', `/queues/${id}/serve-next`, { token })).status, 409);

  const names = ['Ann', 'Ben', 'Cat', 'Dan'];
  let detail;
  for (const personName of names) {
    detail = await call('POST', `/queues/${id}/tokens`, { token, body: { personName } });
    assert.equal(detail.status, 201);
  }
  assert.deepEqual(detail.data.waiting.map((t) => t.personName), names);
  assert.deepEqual(detail.data.waiting.map((t) => t.number), [1, 2, 3, 4]);
  const [ann, ben, cat, dan] = detail.data.waiting;

  // Move Cat up -> Ann, Cat, Ben, Dan
  detail = await call('POST', `/queues/${id}/tokens/${cat.id}/move`, { token, body: { direction: 'up' } });
  assert.deepEqual(detail.data.waiting.map((t) => t.personName), ['Ann', 'Cat', 'Ben', 'Dan']);
  // Move Ann down -> Cat, Ann, Ben, Dan
  detail = await call('POST', `/queues/${id}/tokens/${ann.id}/move`, { token, body: { direction: 'down' } });
  assert.deepEqual(detail.data.waiting.map((t) => t.personName), ['Cat', 'Ann', 'Ben', 'Dan']);
  // Edges
  assert.equal((await call('POST', `/queues/${id}/tokens/${cat.id}/move`, { token, body: { direction: 'up' } })).status, 409);
  assert.equal((await call('POST', `/queues/${id}/tokens/${dan.id}/move`, { token, body: { direction: 'down' } })).status, 409);
  assert.equal((await call('POST', `/queues/${id}/tokens/${dan.id}/move`, { token, body: { direction: 'sideways' } })).status, 400);

  // Serve top -> Cat
  detail = await call('POST', `/queues/${id}/serve-next`, { token });
  assert.equal(detail.data.called.personName, 'Cat');
  assert.equal(detail.data.serving.personName, 'Cat');
  assert.deepEqual(detail.data.waiting.map((t) => t.personName), ['Ann', 'Ben', 'Dan']);

  // Cannot move/cancel the serving token
  assert.equal((await call('POST', `/queues/${id}/tokens/${cat.id}/move`, { token, body: { direction: 'down' } })).status, 409);
  assert.equal((await call('POST', `/queues/${id}/tokens/${cat.id}/cancel`, { token })).status, 409);

  // Cancel Ben
  detail = await call('POST', `/queues/${id}/tokens/${ben.id}/cancel`, { token });
  assert.deepEqual(detail.data.waiting.map((t) => t.personName), ['Ann', 'Dan']);
  assert.equal((await call('POST', `/queues/${id}/tokens/${ben.id}/cancel`, { token })).status, 409);

  // Serve next completes Cat and calls Ann
  detail = await call('POST', `/queues/${id}/serve-next`, { token });
  assert.equal(detail.data.serving.personName, 'Ann');
  assert.equal(detail.data.stats.servedToday, 1);
  assert.equal(detail.data.stats.cancelledToday, 1);
  const statuses = Object.fromEntries(detail.data.history.map((t) => [t.personName, t.status]));
  assert.deepEqual(statuses, { Cat: 'served', Ben: 'cancelled' });

  // Complete without calling next
  detail = await call('POST', `/queues/${id}/complete`, { token });
  assert.equal(detail.data.serving, null);
  assert.equal((await call('POST', `/queues/${id}/complete`, { token })).status, 409);

  // New token after a move gets appended at the end and numbering continues
  detail = await call('POST', `/queues/${id}/tokens`, { token, body: { personName: 'Eve', phone: '+91 98765 43210' } });
  assert.deepEqual(detail.data.waiting.map((t) => [t.personName, t.number]), [['Dan', 4], ['Eve', 5]]);
  assert.equal((await call('POST', `/queues/${id}/tokens`, { token, body: { personName: 'X', phone: 'abc' } })).status, 400);

  // Rename and delete
  assert.equal((await call('PATCH', `/queues/${id}`, { token, body: { name: 'Reception' } })).data.queue.name, 'Reception');
  assert.equal((await call('DELETE', `/queues/${id}`, { token })).status, 204);
  assert.equal((await call('GET', `/queues/${id}`, { token })).status, 404);
});

test('users cannot touch each other’s queues', async () => {
  const a = await register('dave');
  const b = await register('erin');
  const q = await call('POST', '/queues', { token: a, body: { name: 'Private' } });
  const id = q.data.queue.id;
  const t = await call('POST', `/queues/${id}/tokens`, { token: a, body: { personName: 'Zed' } });

  assert.equal((await call('GET', `/queues/${id}`, { token: b })).status, 404);
  assert.equal((await call('POST', `/queues/${id}/tokens`, { token: b, body: { personName: 'Hack' } })).status, 404);
  assert.equal((await call('POST', `/queues/${id}/serve-next`, { token: b })).status, 404);
  assert.equal((await call('POST', `/queues/${id}/tokens/${t.data.token.id}/cancel`, { token: b })).status, 404);
  assert.equal((await call('DELETE', `/queues/${id}`, { token: b })).status, 404);
  assert.equal((await call('GET', `/analytics?queueId=${id}`, { token: b })).status, 404);
  // Same name is fine for a different user
  assert.equal((await call('POST', '/queues', { token: b, body: { name: 'Private' } })).status, 201);
});

test('analytics: shapes, ranges and validation', async () => {
  const login = await call('POST', '/auth/login', { body: { username: 'demo', password: 'demo1234' } });
  const token = login.data.token;
  for (const [range, n] of [['24h', 24], ['7d', 28], ['30d', 30]]) {
    const r = await call('GET', `/analytics?range=${range}&tz=-330`, { token });
    assert.equal(r.status, 200);
    assert.equal(r.data.series.length, n);
    assert.equal(r.data.perQueue.length, 3);
    assert.ok(r.data.kpis.waitingNow > 0);
    const distTotal = r.data.distribution.reduce((s, d) => s + d.count, 0);
    assert.ok(distTotal >= 0);
    for (const p of r.data.series) assert.ok(p.avgLength === null || p.avgLength >= 0);
  }
  const week = await call('GET', '/analytics?range=7d', { token });
  assert.ok(week.data.kpis.served > 50, 'seed should produce a week of history');
  assert.ok(week.data.kpis.avgWaitMs > 0);

  assert.equal((await call('GET', '/analytics?range=1y', { token })).status, 400);
  assert.equal((await call('GET', '/analytics?tz=abc', { token })).status, 400);
});

test('malformed input is rejected cleanly', async () => {
  const token = await register('frank');
  const res = await fetch(`${base}/queues`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: '{bad json',
  });
  assert.equal(res.status, 400);
  assert.equal((await call('GET', '/queues/abc', { token })).status, 400);
  assert.equal((await call('POST', '/queues', { token, body: { name: 42 } })).status, 400);
  assert.equal((await call('GET', '/nope', { token })).status, 404);
});
