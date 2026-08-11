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
- Activity action strings: `Project Created`, `Project Updated`, `Customer Created/Updated/Archived/Restored`, `Document Uploaded`, `Document Deleted`, `Task Created/Updated/Completed/Deleted`, `Comment Added`, `Note Added`, `Stage Updated`, `Document Renamed`.
- `Stage Updated` activity detail prints the raw DB stage values (e.g. `intake → stage_1_engineering`), not the display labels — cosmetic, don't treat as a data bug.
- Known-bug watchlist: `/api/projects/:id/activity` returns raw snake_case rows so the project Activity tab may show `System · —` instead of user/timestamp; and the Activity tab is only fetched on mount, so document actions require a reload to appear. Verify these are fixed before trusting the tab.
- File uploads: click "Upload file", then in the GTK file dialog press ctrl+l and type the absolute path + Enter.
- Responsive test: `wmctrl -r :ACTIVE: -e 0,0,0,430,760` to get a narrow viewport (hamburger appears below the `lg` breakpoint); re-maximize with `wmctrl -r :ACTIVE: -b add,maximized_vert,maximized_horz`.

## Stage workflow (Phase 3+)
- Stage order and labels live in `client/src/lib/constants.ts` `PROJECT_STAGES`: Pipeline → Intake → Stage 1 Engineering → Production Team Quoting → Sales → **Stage 2 Engineering (DB value `stage_2_production`)** → Production → QA → Completed. Always read that array before asserting labels; the label and DB value differ for stage 2.
- New projects created through the UI form default to `pipeline` (`ProjectForm.tsx`). A regression here (form sending `intake`) has happened before — always create via the form, not the API, when checking the default.
- Task statuses (`TASK_STATUSES`): Not Started / In Progress / On Hold / Completed / N/A. Terminal set is `CLOSED_TASK_STATUSES = ['completed','not_applicable']`; anything else blocks auto-advance.
- Per-stage checklists come from `STAGE_TASK_TEMPLATES` in `server/src/services/workflowService.ts` — read it for the exact expected item names/counts of the stage you are testing (pipeline = 5, intake = 4, stage_1_engineering = 2, …).
- Auto-advance (`maybeAdvanceStage`) runs on every task create/update/delete, advances exactly one stage, seeds the next checklist, logs `Stage Updated … (all tasks complete)` and notifies the assigned engineer + salesperson. Assign an engineer/salesperson at project creation if you want to verify those notifications.
- Seeding is once-per-`(project, stage)` via the `project_stage_seeds` marker table, so a deleted checklist item must NOT reappear after further task writes. Test it by deleting an item then changing another task's status, then reloading.
- Stage groups in the Tasks tab collapse by default when all their tasks are terminal AND the group is not the active stage (`collapsedOverride[key] ?? (allDone && !active)`); clicking the header overrides that in both directions.
- Per-task comment threads are separate from the project Notes tab. The collapsed `Comments (n)` count comes from the API (`task.commentCount`), so it must be correct after a reload without ever expanding the thread — a good regression check.
- Mention autocomplete: type `@` plus a prefix (e.g. `@Quinn`) inside a comment/note box; click the suggested name. Notifications are typed `comment_mention` / `stage_updated` / `task_assigned`.

## Devin Secrets Needed
None for Phase 1 UI/API testing. `MILSON_SMTP_PASS` is only needed for quote-email features (later phases).
