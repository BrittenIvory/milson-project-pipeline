import { PoolClient } from 'pg';
import { query, queryOne, pool } from '../db/pool';
import { HttpError } from '../middleware/errors';
import { ProjectStage } from '../types';
import { getTypeTemplate, TemplateStage } from './projectTypeService';

export const STAGE_TASK_TEMPLATES: Record<string, string[]> = {
  intake: ['Information reviewed', 'Create Engineering number', 'Setup SharePoint folder', 'Setup PDM folder'],
  stage_1_engineering: ['Define scope and product requirements', 'Creating MFL quotation drawing'],
  production_team_quoting: ['Supplier(s) selected', 'Sent out for quote', 'Quotes received and stored in Project folder', 'Quote reviewed and accepted'],
  sales: ['Formal quote generated', 'Advise salesperson', 'Sent quote to customer', 'Quote accepted or declined by customer', 'Advise Engineering', 'Notify Supplier(s) not go ahead', 'Send Customer Credit Form', 'Enter Customer into ERP', 'Enter Sales Order for Samples and Pattern'],
  stage_2_production: ['Detailed design study', 'FEA study', 'MFL production CAD created', 'MFL production drawing created', 'MFL balloon drawing peer review', 'MFL balloon drawing accepted', 'Customer design review and feedback', 'Customer approval of MFL design', 'Customer Signed drawing stored in project folder', 'MFL FAIR and PSA document created'],
  production: ['Sample & Pattern Purchase order created', 'PO, Design files, FAIR sent to supplier', 'Add Sample Due Date to system', 'Sample Production Completed', 'Completed FAIR received and store in project folder', 'Sample 3D scanned', 'Sample 3d Scan and FAIR Approved'],
  qa: ['Sample has been Shipped', 'Samples Received', 'Scan Samples', 'Complete PSA', 'PSA sent to Customer', 'Sample has been shipped to Customer', 'Customer Received Sample', 'Customer return signed and approved PSA', 'Completed PSA stored in project folder', 'Sign FAIR and send to Supplier', 'Load Part into MYOB', 'Add Pattern to Register', 'Logistics set Weight, MOQ, Pallet qty', 'Enter Production PO from Customer', 'Confirm Customers Part Number in System'],
  completed: [],
};

/** The stage's checklist from the project's own template snapshot. */
async function stageTaskList(projectId: number, stage: string): Promise<string[]> {
  const row = await queryOne<{ tasks: unknown }>(
    'SELECT tasks FROM project_stages WHERE project_id = $1 AND key = $2',
    [projectId, stage],
  );
  if (!Array.isArray(row?.tasks)) return [];
  return row.tasks.filter((t): t is string => typeof t === 'string');
}

export async function seedStageTasks(projectId: number, stage: string): Promise<number> {
  const template = await stageTaskList(projectId, stage);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const marker = await client.query(
      `INSERT INTO project_stage_seeds (project_id, stage) VALUES ($1, $2)
       ON CONFLICT (project_id, stage) DO NOTHING RETURNING project_id`,
      [projectId, stage],
    );
    if (marker.rowCount === 0 || template.length === 0) {
      await client.query('COMMIT');
      return 0;
    }
    const result = await client.query(
      `INSERT INTO tasks (project_id, task_name, stage, status, priority, assigned_user_id, created_by, sort_order)
       SELECT $1, names.task_name, $2, 'not_started', 'medium', NULL, NULL,
              pos.max_order + names.rn
       FROM unnest($3::text[]) WITH ORDINALITY AS names(task_name, rn),
            (SELECT COALESCE(MAX(sort_order), 0) AS max_order FROM tasks WHERE project_id = $1) pos
       WHERE NOT EXISTS (
         SELECT 1 FROM tasks t
         WHERE t.project_id = $1 AND t.stage = $2 AND t.task_name = names.task_name
       )`,
      [projectId, stage, template],
    );
    await client.query('COMMIT');
    return result.rowCount ?? 0;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function maybeAdvanceStage(
  projectId: number,
): Promise<{ advanced: boolean; from?: string; to?: string }> {
  const project = await queryOne<{ current_stage: ProjectStage }>(
    'SELECT current_stage FROM projects WHERE id = $1',
    [projectId],
  );
  if (!project || project.current_stage === 'completed') return { advanced: false };
  await seedStageTasks(projectId, project.current_stage);
  const tasks = await query<{ status: string }>(
    'SELECT status FROM tasks WHERE project_id = $1 AND stage = $2',
    [projectId, project.current_stage],
  );
  if (tasks.length === 0 || tasks.some((task) => !['completed', 'not_applicable'].includes(task.status))) {
    return { advanced: false };
  }
  const stageRows = await query<{ key: string }>(
    'SELECT key FROM project_stages WHERE project_id = $1 ORDER BY sort_order, id',
    [projectId],
  );
  const keys = stageRows.map((r) => r.key);
  const index = keys.indexOf(project.current_stage);
  const next = index === -1 ? undefined : keys[index + 1];
  if (!next) return { advanced: false };
  await pool.query('UPDATE projects SET current_stage = $2, stage_started_at = NOW(), updated_at = NOW() WHERE id = $1', [
    projectId,
    next,
  ]);
  await seedStageTasks(projectId, next);
  return { advanced: true, from: project.current_stage, to: next };
}

export interface ProjectStageRow {
  key: string;
  label: string;
  tasks: string[];
}

/** A project's applied stage list, in pipeline order. */
export async function listProjectStages(projectId: number): Promise<ProjectStageRow[]> {
  return query<ProjectStageRow>(
    `SELECT key, label, tasks FROM project_stages WHERE project_id = $1 ORDER BY sort_order, id`,
    [projectId],
  );
}

export async function assertProjectStage(projectId: number, stage: string): Promise<void> {
  const row = await queryOne(
    'SELECT 1 AS x FROM project_stages WHERE project_id = $1 AND key = $2',
    [projectId, stage],
  );
  if (!row) throw new HttpError(400, 'That stage is not part of this project');
}

async function insertProjectStages(
  client: PoolClient,
  projectId: number,
  stages: TemplateStage[],
): Promise<void> {
  for (const [index, stage] of stages.entries()) {
    await client.query(
      `INSERT INTO project_stages (project_id, key, label, tasks, sort_order)
       VALUES ($1, $2, $3, $4::jsonb, $5)`,
      [projectId, stage.key, stage.label, JSON.stringify(stage.tasks), index + 1],
    );
  }
}

/**
 * Snapshots a type template onto a new project: its stage list, checklists and
 * the version they came from. Called on project creation.
 */
export async function applyStageSnapshot(
  projectId: number,
  stages: TemplateStage[],
  version: number,
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await insertProjectStages(client, projectId, stages);
    await client.query('UPDATE projects SET template_version = $2 WHERE id = $1', [projectId, version]);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
  for (const stage of stages) {
    await seedStageTasks(projectId, stage.key);
  }
}

/**
 * Brings an existing project onto its type's latest template: replaces the
 * stage snapshot and seeded checklist tasks, keeps user-added tasks (tasks
 * whose stage no longer exists become stage-less), and re-points the project
 * at the first stage when its current stage was removed.
 */
export async function applyProjectTemplate(projectId: number) {
  const project = await queryOne<{ project_type_id: number | null; current_stage: string }>(
    'SELECT project_type_id, current_stage FROM projects WHERE id = $1',
    [projectId],
  );
  if (!project) throw new HttpError(404, 'Project not found');
  const { version, stages } = await getTypeTemplate(project.project_type_id);
  const keys = stages.map((s) => s.key);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Seeded checklist rows are regenerated; user-added tasks are kept.
    await client.query('DELETE FROM tasks WHERE project_id = $1 AND created_by IS NULL', [projectId]);
    await client.query(
      'UPDATE tasks SET stage = NULL WHERE project_id = $1 AND stage IS NOT NULL AND stage <> ALL($2::text[])',
      [projectId, keys],
    );
    await client.query('DELETE FROM project_stage_seeds WHERE project_id = $1', [projectId]);
    await client.query('DELETE FROM project_stages WHERE project_id = $1', [projectId]);
    await insertProjectStages(client, projectId, stages);
    const stageFix = keys.includes(project.current_stage) ? project.current_stage : keys[0];
    await client.query(
      `UPDATE projects SET template_version = $2, current_stage = $3,
         stage_started_at = CASE WHEN current_stage IS DISTINCT FROM $3 THEN NOW() ELSE stage_started_at END,
         updated_at = NOW()
       WHERE id = $1`,
      [projectId, version, stageFix],
    );
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
  for (const stage of stages) {
    await seedStageTasks(projectId, stage.key);
  }
  return version;
}
