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

export interface ProjectFilters {
  search?: string;
  stage?: string;
  customerId?: number;
  engineerId?: number;
  salesId?: number;
  priority?: string;
  material?: string;
  castingProcess?: string;
  createdFrom?: string;
  createdTo?: string;
  updatedFrom?: string;
  updatedTo?: string;
  targetFrom?: string;
  targetTo?: string;
  includeArchived?: boolean;
}

/** Columns the project list can be sorted by, mapped to their SQL expression. */
const SORTABLE_COLUMNS: Record<string, string> = {
  projectNumber: 'p.project_number',
  customerName: 'c.company_name',
  customerPartNumber: 'p.customer_part_number',
  projectName: 'p.project_name',
  currentStage: 'p.current_stage',
  assignedEngineerName: 'e.full_name',
  assignedSalesName: 's.full_name',
  priority: `CASE p.priority WHEN 'critical' THEN 4 WHEN 'high' THEN 3 WHEN 'medium' THEN 2 ELSE 1 END`,
  targetQuoteDate: 'p.target_quote_date',
  createdAt: 'p.created_at',
  updatedAt: 'p.updated_at',
};

/**
 * Builds the shared WHERE clause for the project list. Every filter is
 * optional and they all combine with AND.
 */
function buildProjectWhere(options: ProjectFilters) {
  const params: unknown[] = [];
  const where: string[] = [];
  const eq = (value: unknown, sql: (i: number) => string) => {
    if (value === undefined || value === null || value === '' || value === 'all') return;
    params.push(value);
    where.push(sql(params.length));
  };

  if (!options.includeArchived) where.push('p.is_archived = FALSE');
  if (options.search) {
    params.push(`%${options.search.toLowerCase()}%`);
    where.push(
      `(LOWER(p.project_number) LIKE $${params.length}
        OR LOWER(p.project_name) LIKE $${params.length}
        OR LOWER(c.company_name) LIKE $${params.length}
        OR LOWER(COALESCE(p.customer_part_number,'')) LIKE $${params.length}
        OR LOWER(COALESCE(p.internal_part_number,'')) LIKE $${params.length}
        OR LOWER(COALESCE(p.project_description,'')) LIKE $${params.length})`,
    );
  }
  eq(options.stage, (i) => `p.current_stage = $${i}`);
  eq(options.customerId, (i) => `p.customer_id = $${i}`);
  eq(options.engineerId, (i) => `p.assigned_engineer_id = $${i}`);
  eq(options.salesId, (i) => `p.assigned_sales_id = $${i}`);
  eq(options.priority, (i) => `p.priority = $${i}`);
  eq(options.material, (i) => `LOWER(COALESCE(p.material,'')) = LOWER($${i})`);
  eq(options.castingProcess, (i) => `LOWER(COALESCE(p.casting_process,'')) = LOWER($${i})`);
  eq(options.createdFrom, (i) => `p.created_at >= $${i}::date`);
  eq(options.createdTo, (i) => `p.created_at < $${i}::date + 1`);
  eq(options.updatedFrom, (i) => `p.updated_at >= $${i}::date`);
  eq(options.updatedTo, (i) => `p.updated_at < $${i}::date + 1`);
  eq(options.targetFrom, (i) => `p.target_quote_date >= $${i}::date`);
  eq(options.targetTo, (i) => `p.target_quote_date <= $${i}::date`);

  return { params, clause: where.length ? `WHERE ${where.join(' AND ')}` : '' };
}

export async function listProjects(options: ProjectFilters = {}) {
  const { params, clause } = buildProjectWhere(options);
  const rows = await query<ProjectRow>(
    `${SELECT_PROJECT} ${clause} ORDER BY p.created_at DESC`,
    params,
  );
  return rows.map(toProjectDto);
}

/**
 * Paginated project list used by the Projects table. Returns the page of rows
 * plus the total row count so the client can render pagination controls.
 */
export async function listProjectsPage(
  options: ProjectFilters & {
    sortBy?: string;
    sortDir?: string;
    page?: number;
    pageSize?: number;
  },
) {
  const { params, clause } = buildProjectWhere(options);
  const page = Math.max(1, options.page ?? 1);
  const pageSize = Math.min(Math.max(1, options.pageSize ?? 25), 200);
  const orderBy = SORTABLE_COLUMNS[options.sortBy ?? ''] ?? 'p.created_at';
  const direction = options.sortDir === 'asc' ? 'ASC' : 'DESC';

  const totalRow = await queryOne<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM projects p
     JOIN customers c ON c.id = p.customer_id
     LEFT JOIN users e ON e.id = p.assigned_engineer_id
     LEFT JOIN users s ON s.id = p.assigned_sales_id ${clause}`,
    params,
  );
  const rows = await query<ProjectRow>(
    `${SELECT_PROJECT} ${clause}
     ORDER BY ${orderBy} ${direction} NULLS LAST, p.id DESC
     LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`,
    params,
  );
  return {
    items: rows.map(toProjectDto),
    total: Number(totalRow?.count ?? 0),
    page,
    pageSize,
  };
}

/** Distinct materials and casting processes, used to populate filter menus. */
export async function projectFilterOptions() {
  const materials = await query<{ value: string }>(
    `SELECT DISTINCT material AS value FROM projects
     WHERE material IS NOT NULL AND material <> '' ORDER BY 1`,
  );
  const castingProcesses = await query<{ value: string }>(
    `SELECT DISTINCT casting_process AS value FROM projects
     WHERE casting_process IS NOT NULL AND casting_process <> '' ORDER BY 1`,
  );
  return {
    materials: materials.map((r) => r.value),
    castingProcesses: castingProcesses.map((r) => r.value),
  };
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

/**
 * Aggregates everything the dashboard needs in a single round trip: stage
 * counters, month-to-date throughput and the four project spotlight lists.
 *
 * "Waiting for action" means an open project whose target quote date has
 * passed, or that has at least one overdue task.
 */
export async function dashboardSummary() {
  const stats = await projectStats();

  const counts = await queryOne<{ created_this_month: string; completed_this_month: string }>(
    `SELECT
       (SELECT COUNT(*)::text FROM projects
         WHERE is_archived = FALSE AND created_at >= date_trunc('month', NOW())) AS created_this_month,
       (SELECT COUNT(*)::text FROM projects
         WHERE is_archived = FALSE AND current_stage = 'completed'
           AND updated_at >= date_trunc('month', NOW())) AS completed_this_month`,
  );

  const list = async (extraWhere: string, orderBy: string) =>
    (
      await query<ProjectRow>(
        `${SELECT_PROJECT} WHERE p.is_archived = FALSE AND ${extraWhere}
         ORDER BY ${orderBy} LIMIT 5`,
      )
    ).map(toProjectDto);

  const [recent, recentlyUpdated, upcoming, waiting] = await Promise.all([
    list('TRUE', 'p.created_at DESC'),
    list('TRUE', 'p.updated_at DESC'),
    list(
      `p.current_stage <> 'completed' AND p.target_quote_date >= CURRENT_DATE`,
      'p.target_quote_date ASC',
    ),
    list(
      `p.current_stage <> 'completed' AND (
         p.target_quote_date < CURRENT_DATE
         OR EXISTS (
           SELECT 1 FROM tasks t WHERE t.project_id = p.id
             AND t.status NOT IN ('completed','cancelled')
             AND t.due_date < CURRENT_DATE))`,
      'p.target_quote_date ASC NULLS LAST',
    ),
  ]);

  return {
    ...stats,
    createdThisMonth: Number(counts?.created_this_month ?? 0),
    completedThisMonth: Number(counts?.completed_this_month ?? 0),
    recent,
    recentlyUpdated,
    upcoming,
    waiting,
  };
}
