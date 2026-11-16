# Todo Manager

A multi-user personal to-do app: SSO-only login (Google / GitHub), lists and tasks with search and filters, and **real-time WebSocket notifications** for overdue and soon-due tasks.

- **Backend:** Node 22, Fastify 5, Prisma + SQLite, zod validation, OpenAPI docs at `/docs`
- **Frontend:** React 19, Vite, Tailwind v4, Radix UI, TanStack Query, react-hook-form + zod, sonner toasts
- **Tests:** Vitest (backend API, auth, authorization, WebSocket; frontend components)

## Prerequisites

- Node.js 22+ and npm 10+
- (Optional) Docker, for the containerised run
- OAuth credentials for at least one provider (see below). Without them the UI renders, but login is unavailable.

## Quick start

```bash
npm install
cp .env.example .env        # then fill in SESSION_SECRET and OAuth credentials
npm run db:migrate          # creates backend/prisma/dev.db
npm run dev                 # API on :3000, web on http://localhost:5173
```

Open **http://localhost:5173** (always use this URL in dev: the Vite dev server proxies `/api`, `/auth` and `/ws` to the backend, so cookies stay same-origin).

| Script | What it does |
| --- | --- |
| `npm run dev` | Backend (tsx watch) + frontend (Vite) together |
| `npm test` | Backend and frontend test suites |
| `npm run build` | Type-check + build both workspaces |
| `npm run db:migrate` | Apply/create Prisma migrations (dev) |
| `npm run seed -- --email you@example.com [--tz Europe/Berlin]` | Add sample data to an existing user |
| `npm start` | Run the built backend (serves `frontend/dist` when `STATIC_DIR` is set) |

## SSO setup

Authentication is SSO only (no passwords). Both flows use `state` validation; Google additionally uses PKCE.

### Google

1. [Google Cloud Console](https://console.cloud.google.com/) → *APIs & Services* → *Credentials* → **Create credentials → OAuth client ID**.
2. Application type **Web application**.
3. Authorized redirect URI: `http://localhost:5173/auth/google/callback`
4. Put the client ID/secret into `.env` as `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`.

### GitHub

1. GitHub → *Settings* → *Developer settings* → *OAuth Apps* → **New OAuth App**.
2. Authorization callback URL: `http://localhost:5173/auth/github/callback`
3. Put the client ID/secret into `.env` as `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET`.
   Scopes requested: `read:user user:email` (to read the primary verified email).

A provider with no credentials is simply disabled (`/auth/<provider>/start` redirects to `/login?error=provider_not_configured`).

> The redirect URI is always `{APP_URL}/auth/<provider>/callback`. For Docker (`APP_URL=http://localhost:3000`) register `http://localhost:3000/auth/google/callback` and `http://localhost:3000/auth/github/callback` instead (or in addition).

## Configuration

| Variable | Default | Description |
| --- | --- | --- |
| `PORT` | `3000` | Backend port |
| `APP_URL` | `http://localhost:5173` | Public origin of the app. Used for OAuth redirect URIs, the WebSocket `Origin` check and the `Secure` cookie flag (set when it starts with `https://`) |
| `DATABASE_URL` | `file:./dev.db` | SQLite URL (relative paths resolve against `backend/prisma/`) |
| `SESSION_SECRET` | – (required, ≥16 chars) | HMAC key for hashing session tokens |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | – | Enable Google login |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | – | Enable GitHub login |
| `NOTIFY_INTERVAL_SEC` | `60` | Default interval of periodic notification batches (10–3600) |
| `STATIC_DIR` | – | If set, the backend serves this built frontend (with SPA fallback). Set automatically in Docker |

## Behaviour notes

- **Deleting a list deletes its tasks** (cascade). The UI confirmation shows how many tasks will be removed, and the API returns `deletedTasks`.
- Tasks have `status` (`todo | in_progress | done`), `priority` (`low | medium | high`) and an optional `dueDate` (`YYYY-MM-DD`, a calendar date without timezone).
- "Today" for filters and notifications is computed in the **client's IANA timezone** (`tz` query parameter / `timezone` in the WebSocket `subscribe` message).
- Due filters: `overdue` = before today and not done; `today`; `week` = today … today+6.

## Real-time notifications (WebSocket)

Endpoint: `GET /ws` (WebSocket upgrade). The server checks that the `Origin` header equals `APP_URL` (close code `4403`) and that the `sid` session cookie is valid (close code `4401`). Messages are JSON.

### Rules

| Type | Condition |
| --- | --- |
| `overdue` | status ≠ `done` and `dueDate` < today |
| `due_soon` | status ≠ `done` and today ≤ `dueDate` ≤ today + 3 days (inclusive) |

Notification id: `${type}:${taskId}:${dueDate}`. Acknowledgements are stored per user for that exact id, so **changing a task's due date automatically un-acknowledges it**. Completed tasks never notify.

### Messages

| Direction | Message | Purpose |
| --- | --- | --- |
| S→C | `{ "type": "hello", "user": {id, displayName}, "settings": {types, intervalSec, timezone} }` | Sent once after connect (defaults: both types, `NOTIFY_INTERVAL_SEC`, `UTC`) |
| C→S | `{ "type": "subscribe", "types": ["overdue","due_soon"], "intervalSec": 10..3600, "timezone": "Europe/Berlin" }` | All fields optional; updates settings, reschedules the timer. Server replies `subscribed` and immediately sends a fresh batch |
| S→C | `{ "type": "subscribed", "settings": {...} }` | Confirmation of the effective settings |
| S→C | `{ "type": "notifications", "reason": "initial"\|"interval"\|"change", "generatedAt": ISO, "items": [{id,type,taskId,listId,title,dueDate}] }` | A batch is the **complete current set of unacknowledged notifications** (clients replace their state) |
| C→S | `{ "type": "ack", "ids": ["overdue:…", …] }` | Mark notifications as read (max 500 ids; ids that don't belong to the user are ignored) |
| S→C | `{ "type": "ack_ok", "ids": [...] }` | Ids actually acknowledged |
| S→C | `{ "type": "error", "code": "invalid_json"\|"invalid_message"\|"internal", "message": "…" }` | Bad client message; the connection stays open |

### Scheduling

1. A batch (`reason: "initial"`) is sent right after `hello`.
2. Then every `intervalSec` seconds (`reason: "interval"`).
3. Any task create/update/delete, list delete or sample-data creation by the user pushes a `reason: "change"` batch to all of that user's open sockets.
4. Timers are cleared when the socket closes. The web client reconnects with exponential backoff (1 s → 30 s) and shows a connection-status dot on the bell.

A quick manual test with [`websocat`](https://github.com/vi/websocat):

```bash
websocat -H "Origin: http://localhost:5173" -H "Cookie: sid=<your session cookie>" ws://localhost:3000/ws
```

## API

All `/api/*` routes need the `sid` cookie (401 otherwise). Errors use one shape: `{ "error": { "code", "message", "details?" } }` (validation errors → 400 with `details: [{field, message}]`). Resources of other users return **404**, not 403, so existence is never leaked.

Interactive OpenAPI docs: **http://localhost:3000/docs** (raw spec at `/docs/json`).

| Method & path | Description |
| --- | --- |
| `GET /auth/:provider/start` | Begin SSO (`google` \| `github`) |
| `GET /auth/:provider/callback` | SSO callback; creates the session, redirects to `/` |
| `POST /auth/logout` | Invalidate the session |
| `GET /api/me` | Current user |
| `GET /api/lists` | Lists with task counts |
| `POST /api/lists` | Create list `{name}` (1–100 chars) |
| `PATCH /api/lists/:id` | Rename list |
| `DELETE /api/lists/:id` | Delete list **and its tasks**; returns `{id, deletedTasks}` |
| `GET /api/tasks?listId&q&status&priority&due&tz` | Search / filter (`due`: `overdue\|today\|week\|all`) |
| `POST /api/tasks` | Create task (`listId`, `title` 1–200, `description` ≤5000, `status`, `priority`, `dueDate`) |
| `PATCH /api/tasks/:id` | Partial update (also quick status change) |
| `DELETE /api/tasks/:id` | Delete task |
| `POST /api/sample-data?tz=` | Create 3 sample lists with tasks |
| `GET /ws` | Notifications WebSocket |

### Sample data

Use the **Create sample data** button on the empty state, `POST /api/sample-data`, or `npm run seed -- --email you@example.com` for an existing user. It creates 3 lists with tasks across all statuses/priorities and overdue / today / soon / later / no due dates, relative to the current date.

## Tests

```bash
npm test                     # everything
npm test -w backend          # API, auth, authorization, WebSocket, notification rules
npm test -w frontend         # TaskDialog validation, LoginPage
```

Backend tests run against a fresh temporary SQLite file per run (schema applied with `prisma db push`), use `fastify.inject` / `injectWS`, stub OAuth providers and an injectable clock — no network or real credentials needed.

## Docker

```bash
cp .env.example .env         # fill SESSION_SECRET + OAuth credentials
docker compose up --build    # http://localhost:3000
```

The image builds both workspaces, runs `prisma migrate deploy` on start and serves the SPA and API on port 3000. SQLite lives in the `todo-data` volume (`/data/todo.db`). `APP_URL` is forced to `http://localhost:3000` in `docker-compose.yml`, so register `http://localhost:3000/auth/<provider>/callback` with Google/GitHub. When deploying under a real domain, set `APP_URL` to it (https → `Secure` cookies).

## Security notes

- **OAuth:** random `state` stored in a short-lived httpOnly cookie and compared in constant time; PKCE (S256) for Google; any failure redirects to `/login?error=…`.
- **Sessions:** 32-byte random token in an `httpOnly`, `SameSite=Lax` cookie (`Secure` when `APP_URL` is https); only an HMAC-SHA256 hash is stored in the DB; 30-day expiry; logout deletes the row. `SameSite=Lax` also covers CSRF for the JSON `POST/PATCH/DELETE` endpoints.
- **WebSocket:** `Origin` must equal `APP_URL` (prevents cross-site WebSocket hijacking) and the session cookie must be valid.
- **Authorization:** every query is scoped by `userId`; foreign resources yield 404; moving/creating a task validates that the target list belongs to the user.
- **Input:** all request bodies, queries and WebSocket messages are validated with zod.

## Project layout

```
backend/   src/{app,server,config}.ts  auth/  routes/  ws/  lib/  prisma/  test/
frontend/  src/{api,pages,components,ws,lib}
Dockerfile · docker-compose.yml · .env.example
```
