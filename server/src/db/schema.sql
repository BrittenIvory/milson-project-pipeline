-- Milson Project Pipeline - Phase 1 schema.
-- Idempotent: safe to run on every boot/deploy.

CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  full_name     TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('administrator','engineering','sales','production','quality')),
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  must_change_password BOOLEAN NOT NULL DEFAULT FALSE,
  password_changed_at TIMESTAMPTZ,
  session_version INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Upgrade path for databases created before these columns existed.
ALTER TABLE users ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT FALSE;
-- Tokens issued before this timestamp are rejected; set on every password change/reset.
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMPTZ;
-- Bumped on every password change/reset; tokens carry the version they were
-- issued under and are rejected once it no longer matches.
ALTER TABLE users ADD COLUMN IF NOT EXISTS session_version INTEGER NOT NULL DEFAULT 0;

-- Per-user permission overrides ({key: boolean}); missing keys fall back to
-- the role's default matrix in server/src/permissions.ts.
ALTER TABLE users ADD COLUMN IF NOT EXISTS permissions JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS customers (
  id                SERIAL PRIMARY KEY,
  company_name      TEXT NOT NULL,
  customer_number   TEXT NOT NULL UNIQUE,
  primary_contact   TEXT,
  secondary_contact TEXT,
  email             TEXT,
  phone             TEXT,
  website           TEXT,
  billing_address   TEXT,
  shipping_address  TEXT,
  country           TEXT,
  state             TEXT,
  notes             TEXT,
  status            TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive','archived')),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS customers_company_name_idx ON customers (LOWER(company_name));

-- Dedicated sequence backs the P-0001 project number format.
CREATE SEQUENCE IF NOT EXISTS project_number_seq START WITH 1 INCREMENT BY 1;

CREATE TABLE IF NOT EXISTS projects (
  id                   SERIAL PRIMARY KEY,
  project_number       TEXT NOT NULL UNIQUE,
  customer_id          INTEGER NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  customer_contact     TEXT,
  customer_part_number TEXT,
  internal_part_number TEXT,
  customer_machined_part_number TEXT,
  customer_painted_part_number TEXT,
  customer_unpainted_part_number TEXT,
  project_name         TEXT NOT NULL,
  project_description  TEXT,
  annual_usage         INTEGER,
  material             TEXT,
  estimated_weight     NUMERIC(12,3),
  casting_process      TEXT,
  machining_required   BOOLEAN NOT NULL DEFAULT FALSE,
  heat_treatment       BOOLEAN NOT NULL DEFAULT FALSE,
  painting_required    BOOLEAN NOT NULL DEFAULT FALSE,
  assigned_engineer_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  assigned_sales_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  priority             TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low','medium','high','critical')),
  target_quote_date    DATE,
  notes                TEXT,
  part_image_storage_key TEXT,
  part_image_storage_driver TEXT NOT NULL DEFAULT 'local',
  part_image_file_name TEXT,
  part_image_mime_type TEXT,
  part_image_size_bytes BIGINT,
  current_stage        TEXT NOT NULL DEFAULT 'intake' CHECK (current_stage IN (
                         'intake','stage_1_engineering','production_team_quoting','sales',
                         'stage_2_production','production','qa','completed')),
  stage_started_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_archived          BOOLEAN NOT NULL DEFAULT FALSE,
  created_by           INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS projects_customer_idx ON projects (customer_id);
CREATE INDEX IF NOT EXISTS projects_stage_idx ON projects (current_stage);

CREATE TABLE IF NOT EXISTS documents (
  id             SERIAL PRIMARY KEY,
  project_id     INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  file_name      TEXT NOT NULL,
  storage_key    TEXT NOT NULL,
  storage_driver TEXT NOT NULL DEFAULT 'local',
  mime_type      TEXT,
  extension      TEXT,
  size_bytes     BIGINT NOT NULL,
  document_kind  TEXT NOT NULL DEFAULT 'uploaded',
  uploaded_by    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS documents_project_idx ON documents (project_id);

ALTER TABLE documents ADD COLUMN IF NOT EXISTS document_kind TEXT NOT NULL DEFAULT 'uploaded';
ALTER TABLE documents DROP CONSTRAINT IF EXISTS documents_document_kind_check;
ALTER TABLE documents ADD CONSTRAINT documents_document_kind_check
  CHECK (document_kind IN ('uploaded', 'generated_estimate'));
CREATE UNIQUE INDEX IF NOT EXISTS documents_one_generated_estimate_idx
  ON documents (project_id) WHERE document_kind = 'generated_estimate';

CREATE TABLE IF NOT EXISTS activity_logs (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER REFERENCES users(id) ON DELETE SET NULL,
  user_name   TEXT,
  action      TEXT NOT NULL,
  entity_type TEXT,
  entity_id   INTEGER,
  detail      TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS activity_entity_idx ON activity_logs (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS activity_created_idx ON activity_logs (created_at DESC);

-- ---------------------------------------------------------------------------
-- Phase 2: tasks, notes, notifications.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS tasks (
  id               SERIAL PRIMARY KEY,
  project_id       INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  stage            TEXT,
  task_name        TEXT NOT NULL,
  description      TEXT,
  assigned_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  due_date         DATE,
  start_date       DATE,
  completed_date   DATE,
  requested_date   DATE,
  actual_date      DATE,
  customer_quote_price NUMERIC(12,2),
  priority         TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low','medium','high','critical')),
  status           TEXT NOT NULL DEFAULT 'not_started' CHECK (status IN (
                     'not_started','in_progress','on_hold','completed','not_applicable')),
  completed_at     TIMESTAMPTZ,
  created_by       INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS tasks_project_idx ON tasks (project_id);
CREATE INDEX IF NOT EXISTS tasks_assignee_idx ON tasks (assigned_user_id);

-- Supplier directory and project-specific supplier quote tracking.
CREATE TABLE IF NOT EXISTS suppliers (
  id           SERIAL PRIMARY KEY,
  name         TEXT NOT NULL UNIQUE,
  contact_name TEXT,
  email        TEXT,
  phone        TEXT,
  notes        TEXT,
  is_active    BOOLEAN NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS suppliers_active_idx ON suppliers (is_active, name);

CREATE TABLE IF NOT EXISTS project_supplier_quotes (
  id           SERIAL PRIMARY KEY,
  project_id   INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  supplier_id  INTEGER NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
  selected     BOOLEAN NOT NULL DEFAULT FALSE,
  quoted_price NUMERIC(12,2),
  currency     TEXT NOT NULL DEFAULT 'USD',
  quote_notes  TEXT,
  selected_at  TIMESTAMPTZ,
  reviewed_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (project_id, supplier_id),
  CHECK (quoted_price IS NULL OR quoted_price >= 0),
  CHECK (currency = UPPER(currency) AND char_length(currency) = 3)
);

CREATE INDEX IF NOT EXISTS project_supplier_quotes_project_idx
  ON project_supplier_quotes (project_id, selected, updated_at DESC);

CREATE TABLE IF NOT EXISTS project_notes (
  id         SERIAL PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  author_id  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  body       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS project_notes_project_idx ON project_notes (project_id, created_at DESC);

ALTER TABLE project_notes
  ADD COLUMN IF NOT EXISTS reply_to_note_id INTEGER REFERENCES project_notes(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS notifications (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type        TEXT NOT NULL,
  title       TEXT NOT NULL,
  body        TEXT,
  project_id  INTEGER REFERENCES projects(id) ON DELETE CASCADE,
  entity_type TEXT,
  entity_id   INTEGER,
  actor_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  read_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS notifications_user_idx ON notifications (user_id, created_at DESC);

ALTER TABLE notifications ADD COLUMN IF NOT EXISTS actor_id INTEGER REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

-- ---------------------------------------------------------------------------
-- Phase 3: workflow stages and task comments.
-- ---------------------------------------------------------------------------

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS stage TEXT;

-- 'pipeline' stays allowed historically: stage_started_at may not exist yet on
-- older databases, so the rehome runs later in this file after the column is
-- added. The fixed-list CHECK is intentionally not re-created: stage keys are
-- now per-project (template snapshots) and the constraint is dropped at the
-- end of this file.
ALTER TABLE projects DROP CONSTRAINT IF EXISTS projects_current_stage_check;

ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_status_check;
UPDATE tasks SET status = 'on_hold' WHERE status = 'waiting';
UPDATE tasks SET status = 'not_applicable' WHERE status = 'cancelled';
ALTER TABLE tasks ADD CONSTRAINT tasks_status_check CHECK (status IN (
  'not_started','in_progress','on_hold','completed','not_applicable'
));

ALTER TABLE projects ALTER COLUMN current_stage SET DEFAULT 'intake';
ALTER TABLE projects ADD COLUMN IF NOT EXISTS stage_started_at TIMESTAMPTZ;
UPDATE projects SET stage_started_at = updated_at WHERE stage_started_at IS NULL;
ALTER TABLE projects ALTER COLUMN stage_started_at SET DEFAULT NOW();
ALTER TABLE projects ADD COLUMN IF NOT EXISTS part_image_storage_key TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS part_image_storage_driver TEXT NOT NULL DEFAULT 'local';
ALTER TABLE projects ADD COLUMN IF NOT EXISTS part_image_file_name TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS part_image_mime_type TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS part_image_size_bytes BIGINT;

ALTER TABLE projects ADD COLUMN IF NOT EXISTS customer_machined_part_number TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS customer_painted_part_number TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS customer_unpainted_part_number TEXT;

ALTER TABLE projects ADD COLUMN IF NOT EXISTS client_part_description TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS material_grade TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS alternate_material_acceptable BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS start_date DATE;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS completed_date DATE;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS requested_date DATE;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS actual_date DATE;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS customer_quote_price NUMERIC(12,2);

CREATE TABLE IF NOT EXISTS task_comments (
  id         SERIAL PRIMARY KEY,
  task_id    INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  author_id  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  body       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS task_comments_task_idx ON task_comments (task_id, created_at);

-- Emoji reactions on project comments.
CREATE TABLE IF NOT EXISTS note_reactions (
  id         SERIAL PRIMARY KEY,
  note_id    INTEGER NOT NULL REFERENCES project_notes(id) ON DELETE CASCADE,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  emoji      TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (note_id, user_id, emoji)
);

CREATE INDEX IF NOT EXISTS note_reactions_note_idx ON note_reactions (note_id);

CREATE TABLE IF NOT EXISTS project_stage_seeds (
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  stage      TEXT NOT NULL,
  seeded_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (project_id, stage)
);

INSERT INTO tasks (project_id, task_name, stage, status, priority)
SELECT s.project_id, 'Sample Production Completed', 'production', 'not_started', 'medium'
FROM project_stage_seeds s
WHERE s.stage = 'production'
  AND NOT EXISTS (
    SELECT 1 FROM tasks t
    WHERE t.project_id = s.project_id
      AND t.stage = 'production'
      AND t.task_name = 'Sample Production Completed'
  );

-- Remove the legacy 'pipeline' stage: rehome any rows still in it (safe now —
-- stage_started_at exists above on every database), then tighten the CHECK
-- constraint and default to Project Intake.
UPDATE projects SET current_stage = 'intake', stage_started_at = NOW(), updated_at = NOW()
WHERE current_stage = 'pipeline';
-- The old 'pipeline' stage tasks (Uploaded Drawing, CAD file, Material
-- Specifications, EAU, part details) are removed rather than rehomed.
-- Delete only the seeded checklist items (seeded rows have no creator).
-- Earlier migrations may already have re-tagged them to 'intake', so match by
-- name rather than stage; anything user-created is left untouched.
DELETE FROM tasks WHERE created_by IS NULL AND task_name IN (
  'Uploaded Drawing', 'Uploaded CAD file', 'Updated Material Specifications',
  'Added EAU', 'Updated all part details'
) AND (
  stage IN ('pipeline', 'intake')
  OR (stage IS NULL AND EXISTS (
    SELECT 1 FROM project_stage_seeds s
    WHERE s.project_id = tasks.project_id AND s.stage = 'pipeline'
  ))
);
UPDATE tasks SET stage = 'intake' WHERE stage = 'pipeline';
ALTER TABLE projects DROP CONSTRAINT IF EXISTS projects_current_stage_check;
ALTER TABLE projects ALTER COLUMN current_stage SET DEFAULT 'intake';

-- Per-stage manual ordering for tasks. Backfill preserves the existing
-- created_at order; new rows take MAX(sort_order)+1.
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS sort_order INTEGER;
UPDATE tasks t SET sort_order = sub.rn
FROM (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY project_id ORDER BY created_at, id) AS rn
  FROM tasks
) sub
WHERE t.id = sub.id AND t.sort_order IS NULL;

-- Task comment threading + reactions (parity with project notes).
ALTER TABLE task_comments ADD COLUMN IF NOT EXISTS reply_to_comment_id INTEGER REFERENCES task_comments(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS task_comment_reactions (
  id         SERIAL PRIMARY KEY,
  comment_id INTEGER NOT NULL REFERENCES task_comments(id) ON DELETE CASCADE,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  emoji      TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (comment_id, user_id, emoji)
);

CREATE INDEX IF NOT EXISTS task_comment_reactions_comment_idx ON task_comment_reactions (comment_id);

-- Project types ("templates" in Settings): admin-managed labels like
-- Standard / Complex / Development / Project Revisit. Existing projects
-- backfill to Standard Project.
CREATE TABLE IF NOT EXISTS project_types (
  id         SERIAL PRIMARY KEY,
  name       TEXT NOT NULL UNIQUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active  BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE projects ADD COLUMN IF NOT EXISTS project_type_id INTEGER REFERENCES project_types(id) ON DELETE SET NULL;

-- One-time seed + backfill: schema_meta records that the defaults were
-- installed, so types an admin later deletes are not resurrected by the
-- next restart and projects cleared by a deletion stay unlabeled.
CREATE TABLE IF NOT EXISTS schema_meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM schema_meta WHERE key = 'project_types_seeded') THEN
    INSERT INTO project_types (name, sort_order) VALUES
      ('Standard Project', 1),
      ('Complex Project', 2),
      ('Development Project', 3),
      ('Project Revisit', 4)
    ON CONFLICT (name) DO NOTHING;
    UPDATE projects SET project_type_id = (SELECT id FROM project_types WHERE name = 'Standard Project')
    WHERE project_type_id IS NULL;
    INSERT INTO schema_meta (key, value) VALUES ('project_types_seeded', '1') ON CONFLICT (key) DO NOTHING;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS projects_type_idx ON projects (project_type_id);

-- Per-type workflow templates + per-project stage snapshots.
-- project_types.template holds the editable master (version bumps on every
-- save); each project snapshots it into project_stages at creation, so saved
-- template changes only reach existing projects via the apply-template action.
ALTER TABLE project_types ADD COLUMN IF NOT EXISTS template JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE project_types ADD COLUMN IF NOT EXISTS template_version INTEGER NOT NULL DEFAULT 0;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS template_version INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS project_stages (
  id         SERIAL PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  key        TEXT NOT NULL,
  label      TEXT NOT NULL,
  tasks      JSONB NOT NULL DEFAULT '[]'::jsonb,
  sort_order INTEGER NOT NULL DEFAULT 0,
  UNIQUE (project_id, key)
);
CREATE INDEX IF NOT EXISTS project_stages_project_idx ON project_stages (project_id, sort_order);

-- One-time backfill: existing projects snapshot the standard stage checklist.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM schema_meta WHERE key = 'project_stages_seeded') THEN
    INSERT INTO project_stages (project_id, key, label, tasks, sort_order)
    SELECT p.id, s.key, s.label, s.tasks::jsonb, s.rn
    FROM projects p
    JOIN (VALUES
      (1, 'intake', 'Project Intake',
        '["Information reviewed","Create Engineering number","Setup SharePoint folder","Setup PDM folder"]'),
      (2, 'stage_1_engineering', 'Stage 1 Engineering',
        '["Define scope and product requirements","Creating MFL quotation drawing"]'),
      (3, 'production_team_quoting', 'Production Team Quoting',
        '["Supplier(s) selected","Sent out for quote","Quotes received and stored in Project folder","Quote reviewed and accepted"]'),
      (4, 'sales', 'Sales',
        '["Formal quote generated","Advise salesperson","Sent quote to customer","Quote accepted or declined by customer","Advise Engineering","Notify Supplier(s) not go ahead","Send Customer Credit Form","Enter Customer into ERP","Enter Sales Order for Samples and Pattern"]'),
      (5, 'stage_2_production', 'Stage 2 Engineering',
        '["Detailed design study","FEA study","MFL production CAD created","MFL production drawing created","MFL balloon drawing peer review","MFL balloon drawing accepted","Customer design review and feedback","Customer approval of MFL design","Customer Signed drawing stored in project folder","MFL FAIR and PSA document created"]'),
      (6, 'production', 'Tooling & Sampling',
        '["Sample & Pattern Purchase order created","PO, Design files, FAIR sent to supplier","Add Sample Due Date to system","Sample Production Completed","Completed FAIR received and store in project folder","Sample 3D scanned","Sample 3d Scan and FAIR Approved"]'),
      (7, 'qa', 'Shipping & QA',
        '["Sample has been Shipped","Samples Received","Scan Samples","Complete PSA","PSA sent to Customer","Sample has been shipped to Customer","Customer Received Sample","Customer return signed and approved PSA","Completed PSA stored in project folder","Sign FAIR and send to Supplier","Load Part into MYOB","Add Pattern to Register","Logistics set Weight, MOQ, Pallet qty","Enter Production PO from Customer","Confirm Customers Part Number in System"]'),
      (8, 'completed', 'Completed', '[]')
    ) AS s(rn, key, label, tasks) ON TRUE;
    INSERT INTO schema_meta (key, value) VALUES ('project_stages_seeded', '1') ON CONFLICT (key) DO NOTHING;
  END IF;
END $$;

-- Stage keys are now per-project (template snapshots), so the fixed-list
-- CHECK no longer applies; membership is validated against project_stages.
ALTER TABLE projects DROP CONSTRAINT IF EXISTS projects_current_stage_check;

-- Seeded vs. user-added tasks: created_by goes NULL when the creator's account
-- is deleted, so origin records the source permanently. Template application
-- deletes only origin='seeded' rows.
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS origin TEXT NOT NULL DEFAULT 'manual';
UPDATE tasks SET origin = 'seeded' WHERE created_by IS NULL;
