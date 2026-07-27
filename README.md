# Milson Project Pipeline

Project tracking for Milson Foundry — customer intake through engineering, quoting,
production and quality approval. Replaces the previous Smartsheet workbook.

**Phase 1 scope:** authentication + roles, customers, projects with automatic numbering,
project detail pages, document management, activity log, global search, Render deployment.

## Stack

| Layer    | Technology |
| -------- | ---------- |
| Frontend | React 18, TypeScript, Tailwind CSS, Vite, React Router |
| Backend  | Node.js, Express, TypeScript, Zod |
| Database | PostgreSQL (Render managed) |
| Auth     | JWT access tokens, bcrypt password hashing, role-based permissions |
| Hosting  | Render (`render.yaml` blueprint) |

## Layout

```
client/   React SPA
  src/components/   reusable UI + feature components
  src/pages/        one file per route
  src/lib/api.ts    typed API client (all HTTP lives here)
  src/context/      auth session provider
server/   Express API
  src/routes/       thin HTTP handlers
  src/services/     business logic (customers, projects, documents, activity)
  src/db/           pool, idempotent schema, migrate + seed
render.yaml         Render blueprint (web service + PostgreSQL + uploads disk)
```

Business logic is kept in `server/src/services`; routes only validate input and map
results. The frontend never calls `axios` directly outside `client/src/lib/api.ts`.

## Local development

```bash
# 1. PostgreSQL
sudo -u postgres psql -c "CREATE ROLE milson LOGIN PASSWORD 'milson123'"
sudo -u postgres createdb -O milson milson_pipeline

# 2. API (http://localhost:3002) — applies the schema and seeds users on boot
cd server && cp .env.example .env && npm install && npm run dev

# 3. Frontend (http://localhost:5174, proxies /api to the API)
cd client && npm install && npm run dev
```

### Seeded users

| Email | Password | Role |
| ----- | -------- | ---- |
| admin@milsonfoundry.com | `Admin123!` | Administrator |
| engineer@milsonfoundry.com | `Engineer123!` | Engineering |
| sales@milsonfoundry.com | `Sales123!` | Sales |
| production@milsonfoundry.com | `Production123!` | Production |
| quality@milsonfoundry.com | `Quality123!` | Quality |

Change `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` before the first production deploy.

## Roles

Administrators can do everything. Engineering, Sales and Production may create and edit
projects; Engineering and Sales may manage customers; all authenticated roles (including
Quality) may upload, download and delete project documents. Every route requires a valid
token — there are no anonymous endpoints besides `/api/health` and `/api/auth/login`.

## Project numbering

Numbers use the format `P-0001` and are issued from the `project_number_seq` Postgres
sequence, so concurrent creations cannot collide. `GET /api/projects/next-number` returns
a preview for the New Project form; the number is only consumed when the project is saved.

## Documents

Uploads go through the `DocumentStorage` interface (`server/src/services/storage.ts`).
Phase 1 ships a local-disk driver writing to `STORAGE_DIR`; adding S3/GCS means
implementing the interface and registering it in `createStorage()` — routes, database rows
and the UI stay unchanged because only the opaque `storage_key` is persisted.

Accepted extensions: pdf, dwg, dxf, step, stp, sldprt, sldasm, x_t, x_b, iges, igs, zip,
png, jpg, jpeg, docx, xlsx.

## API

| Method | Path | Notes |
| ------ | ---- | ----- |
| POST | `/api/auth/login` | returns `{ token, user }` |
| GET | `/api/auth/me` | current session |
| GET | `/api/users` | assignment dropdowns |
| GET/POST | `/api/customers` | list (search + status filter) / create |
| GET/PUT | `/api/customers/:id` | detail / update |
| POST | `/api/customers/:id/archive`, `/restore` | soft archive |
| GET/POST | `/api/projects` | list (search, stage, customer) / create |
| GET/PUT | `/api/projects/:id` | detail / update |
| GET | `/api/projects/:id/activity` | project activity feed |
| GET | `/api/projects/next-number`, `/api/projects/stats` | numbering preview, dashboard counters |
| GET/POST | `/api/projects/:id/documents` | list / upload (multipart `file`) |
| GET/DELETE | `/api/projects/:id/documents/:documentId[/download]` | download / delete |
| GET | `/api/activity` | organisation-wide log |
| GET | `/api/search?q=` | projects + customers |

## Deployment (Render)

Deploy `render.yaml` as a Blueprint. It provisions the PostgreSQL instance, a persistent
disk for uploads and the web service, wiring `DATABASE_URL` automatically and generating
`JWT_SECRET`. The API applies the schema and seeds users on every boot, so deploys need no
manual migration step. Express serves the built SPA from `CLIENT_DIST` in production.

## Checks

```bash
cd server && npm run lint && npm run typecheck
cd client && npm run lint && npm run build
```
