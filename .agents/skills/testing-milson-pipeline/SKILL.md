---
name: testing-milson-pipeline
description: How to bring up and end-to-end test the Milson Project Pipeline app (Express API + Vite/React client + Postgres) locally.
---

# Testing the Milson Project Pipeline locally

## Bring-up
1. Postgres must have DB `milson_pipeline` and role `milson`/`milson123`.
2. API: `cd server && DATABASE_URL=postgres://milson:milson123@localhost:5432/milson_pipeline npm run dev` → port 3002. It applies `src/db/schema.sql` and seeds users on boot. Health check: `curl localhost:3002/api/health` → `{"status":"ok"}`.
3. Client: `cd client && npm run dev` → port 5174, proxies `/api` to 3002.
4. If the page renders unstyled or the console shows repeated `[hmr] Failed to reload /src/index.css`, the dev server is in a stale HMR state: kill it, `rm -rf client/.vite client/node_modules/.vite`, restart `npm run dev`, then hard-reload (ctrl+shift+r). This may recur after long-lived dev servers.

## Logins (seeded)
`admin@milsonfoundry.com/Admin123!` (administrator), plus `engineer@`, `sales@`, `production@`, `quality@` with `Engineer123!`, `Sales123!`, `Production123!`, `Quality123!`.

## Permission model (verify before asserting)
- Client gate: `client/src/lib/constants.ts` `EDITOR_ROLES = [administrator, engineering, sales, production]` drives visibility of New Project / New Customer / Edit buttons — `quality` is read-only for those.
- Server gate: `requireRole(...)` in `server/src/middleware/auth.ts` — administrators always bypass, even though they are not listed in the route role arrays.
- Documents: `quality` IS allowed to upload/delete (`server/src/routes/documents.ts`); the upload button shows for any logged-in user.

## Useful facts for writing assertions
- Project numbers auto-generate from a Postgres sequence as `P-%04d` (`services/projectService.ts`); the form pre-fills a disabled field via `GET /api/projects/next-number`. Check `select last_value from project_number_seq;` to predict the next number.
- Customer numbers are NOT auto-generated — manual required field; duplicates return 409 "Customer number X is already in use".
- Activity action strings: `Project Created`, `Project Updated`, `Customer Created/Updated/Archived/Restored`, `Document Uploaded`, `Document Deleted`.
- Known-bug watchlist: `/api/projects/:id/activity` returns raw snake_case rows so the project Activity tab may show `System · —` instead of user/timestamp; and the Activity tab is only fetched on mount, so document actions require a reload to appear. Verify these are fixed before trusting the tab.
- File uploads: click "Upload file", then in the GTK file dialog press ctrl+l and type the absolute path + Enter.
- Responsive test: `wmctrl -r :ACTIVE: -e 0,0,0,430,760` to get a narrow viewport (hamburger appears below the `lg` breakpoint); re-maximize with `wmctrl -r :ACTIVE: -b add,maximized_vert,maximized_horz`.

## Devin Secrets Needed
None for Phase 1 UI/API testing. `MILSON_SMTP_PASS` is only needed for quote-email features (later phases).
