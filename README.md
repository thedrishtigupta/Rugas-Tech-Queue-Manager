# QueueFlow: Queue Management App

A full-stack queue manager. A manager logs in, creates queues, issues tokens to people, reorders them, calls the person at the top with one click, cancels tokens, and watches wait-time and queue-length analytics on a dashboard.

**Stack:** React 18 + Vite + Recharts (client) · Node.js + Express + SQLite via Node's built-in `node:sqlite` (server) · JWT auth with bcrypt-hashed passwords.

There are no native modules to compile, so `npm install` works the same on Windows, macOS and Linux.

## Features

| Requirement | Where it lives |
|---|---|
| 1. Manager login and queue creation | Register / log in (JWT). Create, rename and delete queues from **Queues** |
| 2. Each queue has a name | Names are unique per manager (case-insensitive) |
| 3. Add people, which creates a token | **Add to queue** form. Each queue numbers its tokens in order (`#001`, `#002`, …) |
| 4. List of people waiting | Live waiting list with each person's position, time waited, estimated wait and phone |
| 5. Move tokens up and down | ↑ / ↓ on each row. Both buttons are disabled at the ends of the list |
| 6. Assign the top token for service | **Call next** button. If someone is already being served, they're marked served first. **Finish without calling next** is also available |
| 7. Cancel a token | ✕ on each row, with a confirmation step |
| 8. Analytics dashboard | KPIs (average, median and P90 wait, service time, peak length, cancellations), queue length over time, wait time trend, arrivals vs. served, wait distribution and a per-queue table. Filter by queue and by 24h / 7d / 30d |

Other details:
- Each manager can only see and change their own queues and tokens. Every route checks ownership.
- Moves, "call next" and cancels run inside database transactions.
- The client refreshes every 5 s, timers tick every second, and late responses can't overwrite newer data.
- Light, dark and system themes. The layout works on phones.
- On first start, the app creates a demo account with a week of simulated history so the dashboard has data to show.

## Design

- Purple brand theme with light and dark modes. The brand colors are the `--brand-*` variables at the top of `client/src/styles.css`; change those to retheme.
- Plus Jakarta Sans for all text, Lucide icons.
- The chart palette (purple, orange, aqua) was checked for colorblind-safe contrast in both themes.
- The UI follows the [Vercel Web Interface Guidelines](https://github.com/vercel-labs/web-interface-guidelines). It has visible focus rings, a skip link, labelled icon buttons, inline form errors, reduced-motion support, mobile safe areas and a bottom tab bar on phones.

## Quick start

Requires **Node.js 22.13+** (built-in SQLite).

```bash
npm install          # installs root, server and client dependencies
npm run build        # builds the React app
npm start            # serves API + app on http://localhost:4000
```

Open http://localhost:4000 and log in with **demo / demo1234**, or create a new account.

### Development (hot reload)

```bash
npm run dev          # API on :4000, Vite dev server on http://localhost:5173 (proxies /api)
```

### Other scripts

```bash
npm test             # API integration tests (node:test)
npm run seed         # wipe the database and re-create the demo data
```

### Environment variables (server)

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `4000` | HTTP port |
| `JWT_SECRET` | dev-only value | **Set this in production** |
| `DB_FILE` | `server/data/queue.db` | SQLite file location |
| `SEED_DEMO` | `true` | Set to `false` to skip creating the demo account on an empty DB |

## API

All routes except auth require `Authorization: Bearer <token>`.

```
POST   /api/auth/register            { name, username, password }
POST   /api/auth/login               { username, password }
GET    /api/auth/me

GET    /api/queues                   list with live counts
POST   /api/queues                   { name }
GET    /api/queues/:id               waiting list, now serving, history, stats
PATCH  /api/queues/:id               { name }
DELETE /api/queues/:id

POST   /api/queues/:id/tokens                    { personName, phone? }
POST   /api/queues/:id/tokens/:tokenId/move      { direction: "up" | "down" }
POST   /api/queues/:id/tokens/:tokenId/cancel
POST   /api/queues/:id/serve-next                call the top token
POST   /api/queues/:id/complete                  finish current service

GET    /api/analytics?range=24h|7d|30d&queueId=&tz=<minutes offset>
```

## Data model

```
users  (id, name, username, password_hash, created_at)
queues (id, user_id → users, name, token_counter, created_at)
tokens (id, queue_id → queues, number, person_name, phone,
        status: waiting | serving | served | cancelled,
        position, created_at, called_at, completed_at, cancelled_at)
```

The analytics are computed from token timestamps. Wait time is `called_at − created_at` and service time is `completed_at − called_at`. Queue length at any moment is found by replaying join and leave events in time order, so no snapshot table is needed.

## Project structure

```
server/
  src/app.js              Express app factory
  src/db.js               schema + transaction helper
  src/routes/auth.js      register / login / me
  src/routes/queues.js    queues, tokens, move / serve / cancel
  src/routes/analytics.js dashboard metrics
  src/seed.js             demo data (single-server queue simulation)
  test/api.test.js        integration tests
client/
  src/pages/              Auth, Queues, QueueDetail, Dashboard
  src/components/         Layout, Modal
  src/context.jsx         auth, toasts, theme, ticking clock
  src/styles.css          design tokens (light/dark) and components
```
