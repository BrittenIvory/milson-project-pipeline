import fs from 'fs';
import path from 'path';
import { pool } from './pool';
import { STAGE_TASK_TEMPLATES } from '../services/workflowService';

/**
 * Applies the idempotent schema. Called on server boot and by `npm run migrate`
 * so a fresh Render deploy provisions its database without manual steps.
 */
export async function migrate(): Promise<void> {
  const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  await pool.query(sql);
  const pairs = Object.entries(STAGE_TASK_TEMPLATES).flatMap(([stage, names]) =>
    names.map((name) => ({ stage, name })),
  );
  if (pairs.length > 0) {
    await pool.query(
      `INSERT INTO project_stage_seeds (project_id, stage)
       SELECT DISTINCT t.project_id, t.stage
       FROM tasks t
       JOIN unnest($1::text[], $2::text[]) AS tmpl(stage, task_name)
         ON tmpl.stage = t.stage AND tmpl.task_name = t.task_name
       ON CONFLICT (project_id, stage) DO NOTHING`,
      [pairs.map((p) => p.stage), pairs.map((p) => p.name)],
    );
  }
}

if (require.main === module) {
  migrate()
    .then(() => {
      console.log('Schema applied.');
      return pool.end();
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
