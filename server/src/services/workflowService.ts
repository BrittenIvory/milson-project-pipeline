import { query, queryOne, pool } from '../db/pool';
import { PROJECT_STAGES, ProjectStage } from '../types';

export const STAGE_TASK_TEMPLATES: Record<string, string[]> = {
  pipeline: ['Uploaded Drawing', 'Uploaded CAD file', 'Updated Material Specifications', 'Added EAU', 'Updated all part details'],
  intake: ['Information reviewed', 'Create Engineering number', 'Setup SharePoint folder', 'Setup PDM folder'],
  stage_1_engineering: ['Define scope and product requirements', 'Creating MFL quotation drawing'],
  production_team_quoting: ['Supplier(s) selected', 'Sent out for quote', 'Quotes received and stored in Project folder', 'Quote reviewed and accepted'],
  sales: ['Formal quote generated', 'Advise salesperson', 'Sent quote to customer', 'Quote accepted or declined by customer', 'Advise Engineering', 'Notify Supplier(s) not go ahead', 'Send Customer Credit Form', 'Enter Customer into ERP', 'Enter Sales Order for Samples and Pattern'],
  stage_2_production: ['Detailed design study', 'FEA study', 'MFL production CAD created', 'MFL production drawing created', 'MFL balloon drawing peer review', 'MFL balloon drawing accepted', 'Customer design review and feedback', 'Customer approval of MFL design', 'Customer Signed drawing stored in project folder', 'MFL FAIR and PSA document created'],
  production: ['Sample & Pattern Purchase order created', 'PO, Design files, FAIR sent to supplier', 'Add Sample Due Date to system', 'Completed FAIR received and store in project folder', 'Sample 3D scanned', 'Sample 3d Scan and FAIR Approved'],
  qa: ['Sample has been Shipped', 'Samples Received', 'Scan Samples', 'Complete PSA', 'PSA sent to Customer', 'Sample has been shipped to Customer', 'Customer Received Sample', 'Customer return signed and approved PSA', 'Completed PSA stored in project folder', 'Sign FAIR and send to Supplier', 'Load Part into MYOB', 'Add Pattern to Register', 'Logistics set Weight, MOQ, Pallet qty', 'Enter Production PO from Customer', 'Confirm Customers Part Number in System'],
  completed: [],
};

export async function seedStageTasks(projectId: number, stage: string): Promise<number> {
  const template = STAGE_TASK_TEMPLATES[stage] ?? [];
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
      `INSERT INTO tasks (project_id, task_name, stage, status, priority, assigned_user_id, created_by)
       SELECT $1, names.task_name, $2, 'not_started', 'medium', NULL, NULL
       FROM unnest($3::text[]) AS names(task_name)
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
  const index = PROJECT_STAGES.indexOf(project.current_stage);
  const next = PROJECT_STAGES[index + 1];
  if (!next) return { advanced: false };
  await pool.query('UPDATE projects SET current_stage = $2, updated_at = NOW() WHERE id = $1', [
    projectId,
    next,
  ]);
  await seedStageTasks(projectId, next);
  return { advanced: true, from: project.current_stage, to: next };
}
