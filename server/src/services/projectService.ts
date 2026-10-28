import { z } from 'zod';
import { pool, query, queryOne } from '../db/pool';
import { HttpError } from '../middleware/errors';
import { PRIORITIES } from '../types';
import { calculateQuickQuote } from './quickQuoteService';
import { applyStageSnapshot, assertProjectStage } from './workflowService';
import {
  assertProjectTypeAssignable,
  defaultProjectTypeId,
  getTypeTemplate,
} from './projectTypeService';

export interface ProjectRow {
  id: number;
  project_number: string;
  customer_id: number;
  customer_contact: string | null;
  customer_part_number: string | null;
  internal_part_number: string | null;
  customer_machined_part_number: string | null;
  customer_painted_part_number: string | null;
  customer_unpainted_part_number: string | null;
  project_name: string;
  project_description: string | null;
  annual_usage: number | null;
  customer_quote_price: string | null;
  material: string | null;
  client_part_description: string | null;
  material_grade: string | null;
  alternate_material_acceptable: boolean;
  estimated_weight: string | null;
  casting_process: string | null;
  machining_required: boolean;
  heat_treatment: boolean;
  painting_required: boolean;
  assigned_engineer_id: number | null;
  assigned_sales_id: number | null;
  priority: string;
  project_type_id: number | null;
  type_name?: string | null;
  target_quote_date: string | null;
  notes: string | null;
  part_image_storage_key: string | null;
  part_image_storage_driver: string;
  part_image_file_name: string | null;
  part_image_mime_type: string | null;
  part_image_size_bytes: string | null;
  current_stage: string;
  stage_started_at: string;
  current_stage_days: number;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
  customer_name?: string;
  customer_number?: string;
  template_version: number;
  type_template_version?: number | null;
  stages_json?: { key: string; label: string }[];
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
  customerMachinedPartNumber: optionalText,
  customerPaintedPartNumber: optionalText,
  customerUnpaintedPartNumber: optionalText,
  projectName: z.string().trim().min(1, 'Project name is required').max(200),
  projectDescription: z.string().trim().max(5000).optional().nullable(),
  annualUsage: emptyToNull(z.coerce.number().int().min(0)).optional(),
  material: optionalText,
  clientPartDescription: optionalText,
  materialGrade: optionalText,
  alternateMaterialAcceptable: z.coerce.boolean().default(false),
  estimatedWeight: emptyToNull(z.coerce.number().min(0)).optional(),
  castingProcess: optionalText,
  machiningRequired: z.coerce.boolean().default(false),
  heatTreatment: z.coerce.boolean().default(false),
  paintingRequired: z.coerce.boolean().default(false),
  assignedEngineerId: emptyToNull(z.coerce.number().int().positive()).optional(),
  assignedSalesId: emptyToNull(z.coerce.number().int().positive()).optional(),
  priority: z.enum(PRIORITIES).default('medium'),
  projectTypeId: emptyToNull(z.coerce.number().int().positive()).optional(),
  targetQuoteDate: emptyToNull(z.string()).optional(),
  notes: z.string().trim().max(5000).optional().nullable(),
  currentStage: z.string().trim().min(1).max(80).default('intake'),
});

export type ProjectInput = z.infer<typeof projectSchema>;

/** Maps a joined project row to the camelCase API shape. */
export function toProjectDto(row: ProjectRow) {
  const estimate = calculateQuickQuote({
    id: row.id,
    projectNumber: row.project_number,
    projectName: row.project_name,
    customerName: row.customer_name ?? null,
    customerPartNumber: row.customer_part_number,
    annualUsage: row.annual_usage,
    material: row.material,
    estimatedWeight: row.estimated_weight === null ? null : Number(row.estimated_weight),
    castingProcess: row.casting_process,
    machiningRequired: row.machining_required,
    paintingRequired: row.painting_required,
  });
  const customerQuotePrice =
    row.customer_quote_price === null ? null : Number(row.customer_quote_price);
  const projectValue =
    customerQuotePrice === null
      ? estimate && !estimate.contactRequired
        ? estimate.totalAnnual
        : null
      : row.annual_usage === null
        ? null
        : Math.round(customerQuotePrice * row.annual_usage * 100) / 100;

  return {
    id: row.id,
    projectNumber: row.project_number,
    customerId: row.customer_id,
    customerName: row.customer_name ?? null,
    customerNumber: row.customer_number ?? null,
    customerContact: row.customer_contact,
    customerPartNumber: row.customer_part_number,
    internalPartNumber: row.internal_part_number,
    customerMachinedPartNumber: row.customer_machined_part_number,
    customerPaintedPartNumber: row.customer_painted_part_number,
    customerUnpaintedPartNumber: row.customer_unpainted_part_number,
    projectName: row.project_name,
    projectDescription: row.project_description,
    annualUsage: row.annual_usage,
    customerQuotePrice,
    material: row.material,
    clientPartDescription: row.client_part_description,
    materialGrade: row.material_grade,
    alternateMaterialAcceptable: row.alternate_material_acceptable,
    estimatedWeight: row.estimated_weight === null ? null : Number(row.estimated_weight),
    estimatePartPrice: estimate && !estimate.contactRequired ? estimate.unitPrice : null,
    projectValue,
    projectValueCurrency:
      customerQuotePrice !== null
        ? 'USD'
        : estimate && !estimate.contactRequired
          ? 'USD'
          : null,
    castingProcess: row.casting_process,
    machiningRequired: row.machining_required,
    heatTreatment: row.heat_treatment,
    paintingRequired: row.painting_required,
    assignedEngineerId: row.assigned_engineer_id,
    assignedEngineerName: row.engineer_name ?? null,
    assignedSalesId: row.assigned_sales_id,
    assignedSalesName: row.sales_name ?? null,
    priority: row.priority,
    projectTypeId: row.project_type_id,
    projectTypeName: row.type_name ?? null,
    targetQuoteDate: row.target_quote_date,
    notes: row.notes,
    partImageStorageKey: row.part_image_storage_key,
    partImageStorageDriver: row.part_image_storage_driver ?? 'local',
    partImageFileName: row.part_image_file_name,
    partImageMimeType: row.part_image_mime_type,
    partImageSizeBytes: row.part_image_size_bytes === null ? null : Number(row.part_image_size_bytes),
    stages: row.stages_json ?? [],
    templateUpdateAvailable: row.template_version < (row.type_template_version ?? 0),
    currentStage: row.current_stage,
    stageStartedAt: row.stage_started_at,
    currentStageDays: row.current_stage_days,
    isArchived: row.is_archived,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** A project's part identity: internal part number, else the customer one. */
export const PART_NUMBER_KEY = `COALESCE(NULLIF(p.internal_part_number, ''), NULLIF(p.customer_part_number, ''))`;

const SELECT_PROJECT = `
  SELECT p.*, c.company_name AS customer_name, c.customer_number,
         e.full_name AS engineer_name, s.full_name AS sales_name,
         pt.name AS type_name, pt.template_version AS type_template_version,
         (SELECT COALESCE(json_agg(json_build_object('key', ps.key, 'label', ps.label)
            ORDER BY ps.sort_order), '[]'::json)
          FROM project_stages ps WHERE ps.project_id = p.id) AS stages_json,
         (
           SELECT t.customer_quote_price
           FROM tasks t
           WHERE t.project_id = p.id AND t.task_name = 'Formal quote generated'
           ORDER BY t.created_at, t.id
           LIMIT 1
         ) AS customer_quote_price,
         GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (NOW() - p.stage_started_at)) / 86400))::int AS current_stage_days
  FROM projects p
  JOIN customers c ON c.id = p.customer_id
  LEFT JOIN users e ON e.id = p.assigned_engineer_id
  LEFT JOIN users s ON s.id = p.assigned_sales_id
  LEFT JOIN project_types pt ON pt.id = p.project_type_id`;

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
  typeId?: number;
  material?: string;
  castingProcess?: string;
  createdFrom?: string;
  createdTo?: string;
  updatedFrom?: string;
  updatedTo?: string;
  targetFrom?: string;
  targetTo?: string;
  includeArchived?: boolean;
  /** Exact match on internal part number, falling back to customer part number. */
  partNumber?: string;
}

/** Columns the project list can be sorted by, mapped to their SQL expression. */
const SORTABLE_COLUMNS: Record<string, string> = {
  projectNumber: 'p.project_number',
  customerName: 'c.company_name',
  customerPartNumber: 'p.customer_part_number',
  internalPartNumber: 'p.internal_part_number',
  projectName: 'p.project_name',
  currentStage: 'p.current_stage',
  assignedEngineerName: 'e.full_name',
  assignedSalesName: 's.full_name',
  priority: `CASE p.priority WHEN 'critical' THEN 4 WHEN 'high' THEN 3 WHEN 'medium' THEN 2 ELSE 1 END`,
  projectType: 'pt.name',
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
        OR LOWER(COALESCE(p.project_description,'')) LIKE $${params.length}
        OR LOWER(COALESCE(p.client_part_description,'')) LIKE $${params.length}
        OR LOWER(COALESCE(p.material_grade,'')) LIKE $${params.length})`,
    );
  }
  eq(options.stage, (i) => `p.current_stage = $${i}`);
  eq(options.customerId, (i) => `p.customer_id = $${i}`);
  eq(options.engineerId, (i) => `p.assigned_engineer_id = $${i}`);
  eq(options.salesId, (i) => `p.assigned_sales_id = $${i}`);
  eq(options.priority, (i) => `p.priority = $${i}`);
  eq(options.typeId, (i) => `p.project_type_id = $${i}`);
  eq(options.material, (i) => `LOWER(COALESCE(p.material,'')) = LOWER($${i})`);
  eq(options.castingProcess, (i) => `LOWER(COALESCE(p.casting_process,'')) = LOWER($${i})`);
  eq(options.createdFrom, (i) => `p.created_at >= $${i}::date`);
  eq(options.createdTo, (i) => `p.created_at < $${i}::date + 1`);
  eq(options.updatedFrom, (i) => `p.updated_at >= $${i}::date`);
  eq(options.updatedTo, (i) => `p.updated_at < $${i}::date + 1`);
  eq(options.targetFrom, (i) => `p.target_quote_date >= $${i}::date`);
  eq(options.targetTo, (i) => `p.target_quote_date <= $${i}::date`);
  // partNumber is a value filter, not a dropdown choice: 'all' is a legitimate
  // part number and must not be skipped like the enum-style filters above.
  if (options.partNumber) {
    params.push(options.partNumber);
    where.push(`${PART_NUMBER_KEY} = $${params.length}`);
  }

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
     LEFT JOIN users s ON s.id = p.assigned_sales_id
     LEFT JOIN project_types pt ON pt.id = p.project_type_id ${clause}`,
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
  const typeId =
    input.projectTypeId != null
      ? await assertProjectTypeAssignable(input.projectTypeId)
      : await defaultProjectTypeId();
  const template = await getTypeTemplate(typeId);
  if (!template.stages.some((s) => s.key === input.currentStage)) {
    throw new HttpError(400, 'Selected stage is not part of this project type');
  }
  const inserted = await queryOne<{ id: number }>(
    `INSERT INTO projects (project_number, customer_id, customer_contact, customer_part_number,
       internal_part_number, customer_machined_part_number, customer_painted_part_number,
       customer_unpainted_part_number, project_name, project_description, annual_usage, material,
       client_part_description, material_grade, alternate_material_acceptable,
       estimated_weight, casting_process, machining_required, heat_treatment, painting_required,
       assigned_engineer_id, assigned_sales_id, priority, project_type_id, target_quote_date, notes,
       current_stage, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28)
     RETURNING id`,
    [
      projectNumber, input.customerId, input.customerContact ?? null,
      input.customerPartNumber ?? null, input.internalPartNumber ?? null,
      input.customerMachinedPartNumber ?? null, input.customerPaintedPartNumber ?? null,
      input.customerUnpaintedPartNumber ?? null, input.projectName,
      input.projectDescription ?? null, input.annualUsage ?? null, input.material ?? null,
      input.clientPartDescription ?? null, input.materialGrade ?? null,
      input.alternateMaterialAcceptable,
      input.estimatedWeight ?? null, input.castingProcess ?? null, input.machiningRequired,
      input.heatTreatment, input.paintingRequired, input.assignedEngineerId ?? null,
      input.assignedSalesId ?? null, input.priority, typeId, input.targetQuoteDate ?? null,
      input.notes ?? null, input.currentStage, createdBy,
    ],
  );
  const projectId = (inserted as { id: number }).id;
  await applyStageSnapshot(projectId, template.stages, template.version);
  return getProject(projectId);
}

export async function updateProject(id: number, input: ProjectInput) {
  await getProject(id);
  await assertCustomerExists(input.customerId);
  // undefined leaves the label untouched; explicit null clears it; an id is
  // validated so deactivated/deleted types cannot be assigned via the API.
  if (input.projectTypeId != null) {
    await assertProjectTypeAssignable(input.projectTypeId);
  }
  await assertProjectStage(id, input.currentStage);
  await pool.query(
    `UPDATE projects SET customer_id=$2, customer_contact=$3, customer_part_number=$4,
       internal_part_number=$5, customer_machined_part_number=$6, customer_painted_part_number=$7,
       customer_unpainted_part_number=$8, project_name=$9, project_description=$10, annual_usage=$11,
       material=$12, client_part_description=$13, material_grade=$14,
       alternate_material_acceptable=$15, estimated_weight=$16, casting_process=$17,
       machining_required=$18, heat_treatment=$19, painting_required=$20,
       assigned_engineer_id=$21, assigned_sales_id=$22,
       priority=$23,
       project_type_id = CASE WHEN $24::boolean THEN $25 ELSE project_type_id END,
       target_quote_date=$26, notes=$27, current_stage=$28,
       stage_started_at=CASE WHEN current_stage IS DISTINCT FROM $28 THEN NOW() ELSE stage_started_at END,
       updated_at=NOW()
     WHERE id=$1`,
    [
      id, input.customerId, input.customerContact ?? null, input.customerPartNumber ?? null,
      input.internalPartNumber ?? null, input.customerMachinedPartNumber ?? null,
      input.customerPaintedPartNumber ?? null, input.customerUnpaintedPartNumber ?? null,
      input.projectName, input.projectDescription ?? null,
      input.annualUsage ?? null, input.material ?? null,
      input.clientPartDescription ?? null, input.materialGrade ?? null,
      input.alternateMaterialAcceptable, input.estimatedWeight ?? null,
      input.castingProcess ?? null, input.machiningRequired, input.heatTreatment,
      input.paintingRequired, input.assignedEngineerId ?? null, input.assignedSalesId ?? null,
      input.priority, input.projectTypeId !== undefined, input.projectTypeId ?? null,
      input.targetQuoteDate ?? null, input.notes ?? null, input.currentStage,
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
             AND t.status NOT IN ('completed','not_applicable')
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
