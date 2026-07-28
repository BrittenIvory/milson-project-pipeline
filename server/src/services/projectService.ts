import { z } from 'zod';
import { pool, query, queryOne } from '../db/pool';
import { HttpError } from '../middleware/errors';
import { PRIORITIES, PROJECT_STAGES } from '../types';

export interface ProjectRow {
  id: number;
  project_number: string;
  customer_id: number;
  customer_contact: string | null;
  customer_part_number: string | null;
  internal_part_number: string | null;
  project_name: string;
  project_description: string | null;
  annual_usage: number | null;
  material: string | null;
  estimated_weight: string | null;
  casting_process: string | null;
  machining_required: boolean;
  heat_treatment: boolean;
  painting_required: boolean;
  assigned_engineer_id: number | null;
  assigned_sales_id: number | null;
  priority: string;
  target_quote_date: string | null;
  notes: string | null;
  current_stage: string;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
  customer_name?: string;
  customer_number?: string;
  engineer_name?: string | null;
  sales_name?: string | null;
}

const optionalText = z.string().trim().max(500).optional().nullable();
const emptyToNull = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((value) => (value === '' || value === undefined ? null : value), schema.nullable());

export const projectSchema = z.object({
  customerId: z.coerce.number().int().positive('Customer is required'),
  customerContact: optionalText,
  customerPartNumber: optionalText,
  internalPartNumber: optionalText,
  projectName: z.string().trim().min(1, 'Project name is required').max(200),
  projectDescription: z.string().trim().max(5000).optional().nullable(),
  annualUsage: emptyToNull(z.coerce.number().int().min(0)).optional(),
  material: optionalText,
  estimatedWeight: emptyToNull(z.coerce.number().min(0)).optional(),
  castingProcess: optionalText,
  machiningRequired: z.coerce.boolean().default(false),
  heatTreatment: z.coerce.boolean().default(false),
  paintingRequired: z.coerce.boolean().default(false),
  assignedEngineerId: emptyToNull(z.coerce.number().int().positive()).optional(),
  assignedSalesId: emptyToNull(z.coerce.number().int().positive()).optional(),
  priority: z.enum(PRIORITIES).default('medium'),
  targetQuoteDate: emptyToNull(z.string()).optional(),
  notes: z.string().trim().max(5000).optional().nullable(),
  currentStage: z.enum(PROJECT_STAGES).default('intake'),
});

export type ProjectInput = z.infer<typeof projectSchema>;

/** Maps a joined project row to the camelCase API shape. */
export function toProjectDto(row: ProjectRow) {
  return {
    id: row.id,
    projectNumber: row.project_number,
    customerId: row.customer_id,
    customerName: row.customer_name ?? null,
    customerNumber: row.customer_number ?? null,
    customerContact: row.customer_contact,
    customerPartNumber: row.customer_part_number,
    internalPartNumber: row.internal_part_number,
    projectName: row.project_name,
    projectDescription: row.project_description,
    annualUsage: row.annual_usage,
    material: row.material,
    estimatedWeight: row.estimated_weight === null ? null : Number(row.estimated_weight),
    castingProcess: row.casting_process,
    machiningRequired: row.machining_required,
    heatTreatment: row.heat_treatment,
    paintingRequired: row.painting_required,
    assignedEngineerId: row.assigned_engineer_id,
    assignedEngineerName: row.engineer_name ?? null,
    assignedSalesId: row.assigned_sales_id,
    assignedSalesName: row.sales_name ?? null,
    priority: row.priority,
    targetQuoteDate: row.target_quote_date,
    notes: row.notes,
    currentStage: row.current_stage,
    isArchived: row.is_archived,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const SELECT_PROJECT = `
  SELECT p.*, c.company_name AS customer_name, c.customer_number,
         e.full_name AS engineer_name, s.full_name AS sales_name
  FROM projects p
  JOIN customers c ON c.id = p.customer_id
  LEFT JOIN users e ON e.id = p.assigned_engineer_id
  LEFT JOIN users s ON s.id = p.assigned_sales_id`;

/**
 * Reserves the next project number (`P-0001`, `P-0002`, ...). Uses a Postgres
 * sequence so concurrent creations can never collide.
 */
export async function nextProjectNumber(): Promise<string> {
  const row = await queryOne<{ nextval: string }>("SELECT nextval('project_number_seq')");
  return `P-${String(Number(row?.nextval ?? 1)).padStart(4, '0')}`;
}

export async function listProjects(options: {
  search?: string;
  stage?: string;
  customerId?: number;
  includeArchived?: boolean;
}) {
  const params: unknown[] = [];
  const where: string[] = [];
  if (!options.includeArchived) where.push('p.is_archived = FALSE');
  if (options.search) {
    params.push(`%${options.search.toLowerCase()}%`);
    where.push(
      `(LOWER(p.project_number) LIKE $${params.length}
        OR LOWER(p.project_name) LIKE $${params.length}
        OR LOWER(c.company_name) LIKE $${params.length}
        OR LOWER(COALESCE(p.customer_part_number,'')) LIKE $${params.length}
        OR LOWER(COALESCE(p.internal_part_number,'')) LIKE $${params.length})`,
    );
  }
  if (options.stage && options.stage !== 'all') {
    params.push(options.stage);
    where.push(`p.current_stage = $${params.length}`);
  }
  if (options.customerId) {
    params.push(options.customerId);
    where.push(`p.customer_id = $${params.length}`);
  }
  const rows = await query<ProjectRow>(
    `${SELECT_PROJECT} ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
     ORDER BY p.created_at DESC`,
    params,
  );
  return rows.map(toProjectDto);
}

export async function getProject(id: number) {
  const row = await queryOne<ProjectRow>(`${SELECT_PROJECT} WHERE p.id = $1`, [id]);
  if (!row) throw new HttpError(404, 'Project not found');
  return toProjectDto(row);
}

async function assertCustomerExists(customerId: number) {
  const customer = await queryOne<{ id: number }>('SELECT id FROM customers WHERE id = $1', [
    customerId,
  ]);
  if (!customer) throw new HttpError(400, 'Selected customer does not exist');
}

/** Creates a project with an auto-generated project number. */
export async function createProject(input: ProjectInput, createdBy: number) {
  await assertCustomerExists(input.customerId);
  const projectNumber = await nextProjectNumber();
  const inserted = await queryOne<{ id: number }>(
    `INSERT INTO projects (project_number, customer_id, customer_contact, customer_part_number,
       internal_part_number, project_name, project_description, annual_usage, material,
       estimated_weight, casting_process, machining_required, heat_treatment, painting_required,
       assigned_engineer_id, assigned_sales_id, priority, target_quote_date, notes, current_stage,
       created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)
     RETURNING id`,
    [
      projectNumber, input.customerId, input.customerContact ?? null,
      input.customerPartNumber ?? null, input.internalPartNumber ?? null, input.projectName,
      input.projectDescription ?? null, input.annualUsage ?? null, input.material ?? null,
      input.estimatedWeight ?? null, input.castingProcess ?? null, input.machiningRequired,
      input.heatTreatment, input.paintingRequired, input.assignedEngineerId ?? null,
      input.assignedSalesId ?? null, input.priority, input.targetQuoteDate ?? null,
      input.notes ?? null, input.currentStage, createdBy,
    ],
  );
  return getProject((inserted as { id: number }).id);
}

export async function updateProject(id: number, input: ProjectInput) {
  await getProject(id);
  await assertCustomerExists(input.customerId);
  await pool.query(
    `UPDATE projects SET customer_id=$2, customer_contact=$3, customer_part_number=$4,
       internal_part_number=$5, project_name=$6, project_description=$7, annual_usage=$8,
       material=$9, estimated_weight=$10, casting_process=$11, machining_required=$12,
       heat_treatment=$13, painting_required=$14, assigned_engineer_id=$15, assigned_sales_id=$16,
       priority=$17, target_quote_date=$18, notes=$19, current_stage=$20, updated_at=NOW()
     WHERE id=$1`,
    [
      id, input.customerId, input.customerContact ?? null, input.customerPartNumber ?? null,
      input.internalPartNumber ?? null, input.projectName, input.projectDescription ?? null,
      input.annualUsage ?? null, input.material ?? null, input.estimatedWeight ?? null,
      input.castingProcess ?? null, input.machiningRequired, input.heatTreatment,
      input.paintingRequired, input.assignedEngineerId ?? null, input.assignedSalesId ?? null,
      input.priority, input.targetQuoteDate ?? null, input.notes ?? null, input.currentStage,
    ],
  );
  return getProject(id);
}

/** Dashboard counters: totals plus a per-stage breakdown. */
export async function projectStats() {
  const byStage = await query<{ current_stage: string; count: string }>(
    'SELECT current_stage, COUNT(*)::text AS count FROM projects WHERE is_archived = FALSE GROUP BY current_stage',
  );
  const totals = await queryOne<{ projects: string; customers: string; documents: string }>(
    `SELECT
       (SELECT COUNT(*)::text FROM projects WHERE is_archived = FALSE) AS projects,
       (SELECT COUNT(*)::text FROM customers WHERE status <> 'archived') AS customers,
       (SELECT COUNT(*)::text FROM documents) AS documents`,
  );
  return {
    totals: {
      projects: Number(totals?.projects ?? 0),
      customers: Number(totals?.customers ?? 0),
      documents: Number(totals?.documents ?? 0),
    },
    byStage: Object.fromEntries(byStage.map((r) => [r.current_stage, Number(r.count)])),
  };
}
