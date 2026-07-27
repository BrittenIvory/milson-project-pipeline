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
  current_stage        TEXT NOT NULL DEFAULT 'intake' CHECK (current_stage IN (
                         'intake','stage_1_engineering','production_team_quoting','sales',
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
