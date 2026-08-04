-- Milson Project Pipeline - Phase 1 schema.
-- Idempotent: safe to run on every boot/deploy.

CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  full_name     TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('administrator','engineering','sales','production','quality')),
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

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
  current_stage        TEXT NOT NULL DEFAULT 'pipeline' CHECK (current_stage IN (
                         'pipeline','intake','stage_1_engineering','production_team_quoting','sales',
                         'stage_2_production','production','qa','completed')),
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
  uploaded_by    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS documents_project_idx ON documents (project_id);

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

CREATE TABLE IF NOT EXISTS project_notes (
  id         SERIAL PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  author_id  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  body       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS project_notes_project_idx ON project_notes (project_id, created_at DESC);

CREATE TABLE IF NOT EXISTS notifications (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type        TEXT NOT NULL,
  title       TEXT NOT NULL,
  body        TEXT,
  project_id  INTEGER REFERENCES projects(id) ON DELETE CASCADE,
  entity_type TEXT,
  entity_id   INTEGER,
  read_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS notifications_user_idx ON notifications (user_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- Phase 3: workflow stages and task comments.
-- ---------------------------------------------------------------------------

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS stage TEXT;

ALTER TABLE projects DROP CONSTRAINT IF EXISTS projects_current_stage_check;
ALTER TABLE projects ADD CONSTRAINT projects_current_stage_check CHECK (current_stage IN (
  'pipeline','intake','stage_1_engineering','production_team_quoting','sales',
  'stage_2_production','production','qa','completed'
));

ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_status_check;
UPDATE tasks SET status = 'on_hold' WHERE status = 'waiting';
UPDATE tasks SET status = 'not_applicable' WHERE status = 'cancelled';
ALTER TABLE tasks ADD CONSTRAINT tasks_status_check CHECK (status IN (
  'not_started','in_progress','on_hold','completed','not_applicable'
));

ALTER TABLE projects ALTER COLUMN current_stage SET DEFAULT 'pipeline';

CREATE TABLE IF NOT EXISTS task_comments (
  id         SERIAL PRIMARY KEY,
  task_id    INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  author_id  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  body       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS task_comments_task_idx ON task_comments (task_id, created_at);
