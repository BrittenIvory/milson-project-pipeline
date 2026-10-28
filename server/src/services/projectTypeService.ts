import { z } from 'zod';
import { query, queryOne } from '../db/pool';
import { HttpError } from '../middleware/errors';

export interface ProjectTypeRow {
  id: number;
  name: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
}

const toDto = (row: ProjectTypeRow) => ({
  id: row.id,
  name: row.name,
  sortOrder: row.sort_order,
  isActive: row.is_active,
});

export const projectTypeSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(100),
  sortOrder: z.coerce.number().int().optional(),
  isActive: z.coerce.boolean().optional(),
});

export interface TemplateStage {
  key: string;
  label: string;
  tasks: string[];
}

export const templateSchema = z.object({
  stages: z
    .array(
      z.object({
        key: z
          .string()
          .trim()
          .min(1, 'Stage key is required')
          .max(80)
          .regex(/^[a-z0-9_]+$/, 'Stage keys may only use lowercase letters, numbers, and underscores'),
        label: z.string().trim().min(1, 'Stage label is required').max(120),
        tasks: z.array(z.string().trim().min(1).max(300)).max(200),
      }),
    )
    .min(1, 'At least one stage is required')
    .max(50),
});

// Default workflow templates per project type, from the "Project Tasks by
// Project Type" sheet. Stage keys reuse the app's canonical keys so stage
// coloring and advancement behave the same; labels match the sheet.
const PRODUCTION_TEAM_QUOTING_TASKS = [
  'Supplier(s) selected [tick boxes below for each supplier]',
  'Sent out for quote [task per supplier ticked]',
  'Quotes received & stored in Project folder [task per supplier ticked]',
  'Quotes reviewed & accepted [task per supplier ticked]',
  'Advise suppliers quote unsucessful [task per supplier ticked]',
  'Move Project to Sales',
];

const SALES_TASKS = [
  'Advise sales quote is ready to review',
  'Formal quote generated & sent to cust.',
  'Quoted cost to customer [entry box]',
  'Quote accepted or declined by customer [milsestone]',
  'Advise Engineering of customer decision',
  'Notify chosen Supplier quote declined',
  'New Customer Credit Form',
  'Enter Customer into ERP',
  'Email customer order receipt, notified of steps until tooling start',
  'QA check customer QA requirements',
  'Move Project to Stage 2 Engineering',
];

const STAGE_2_ENGINEERING_TASKS = [
  'Milson production CAD created',
  'Milson production drawing created',
  'Milson production drawing peer review',
  'Customer - Milson production design &/or drawing reviewed & approved',
  'Customer - Signed Milson drawing stored in project folder [milestone]',
  'Milson FAIR & PSA created',
  'Move Project to Tooling & Sampling',
];

const TOOLING_AND_SAMPLING_TASKS = [
  'Sample & Pattern PO created',
  'Sample & Pattern SO created',
  'PO, Design files & FAIR sent to supplier [milstone]',
  'Tooling manufacturing',
  'Completed tooling image received',
  'Sampling',
  'Samples completed [milestone]',
  'Sample inspection - supplier & 3D scan co.',
  'Completed FAIRs received & stored in project folder',
  'FAIR reviewed & approved [milestone]',
  'Declined FAIR, inform foundry to isolate current samples',
  'Move Project to QA',
];

const QA_AND_SHIPPING_TASKS = [
  'Sample shipping to HQ',
  'Samples 3D scanned & files saved in project folder',
  'PSA completed & sent to customer',
  'Ship sample to customer',
  'Customer received sample',
  'Customer return signed & approved PSA [milsestone]',
  'Completed PSA stored in project folder',
  'Approved FAIR sent to supplier',
  'Load approved part to ERP',
  'Confirm vendor default is selected & pricing is loaded in ERP',
  'Add pattern to register',
  'Logistics set Weight, MOQ, Pallet qty',
  'Enter Production PO from Customer',
  'Check Customer part number is correct in system',
  'Check Milson to be set as the default supplier',
  'QA review tasks and notify closure of project',
  'Move Project to Archive',
];

function sheetTemplate(intake: string[], stage1: string[], archive: string[]): TemplateStage[] {
  return [
    { key: 'intake', label: 'INTAKE', tasks: intake },
    { key: 'stage_1_engineering', label: 'STAGE 1 ENGINEERING', tasks: stage1 },
    { key: 'production_team_quoting', label: 'PRODUCTION TEAM QUOTING', tasks: PRODUCTION_TEAM_QUOTING_TASKS },
    { key: 'sales', label: 'SALES', tasks: SALES_TASKS },
    { key: 'stage_2_production', label: 'STAGE 2 ENGINEERING', tasks: STAGE_2_ENGINEERING_TASKS },
    { key: 'production', label: 'TOOLING & SAMPLING', tasks: TOOLING_AND_SAMPLING_TASKS },
    { key: 'qa', label: 'QA & SHIPPING', tasks: QA_AND_SHIPPING_TASKS },
    { key: 'completed', label: 'ARCHIVE', tasks: archive },
  ];
}

const TYPE_TEMPLATES: Record<string, TemplateStage[]> = {
  // "Part as Received" column.
  'Standard Project': sheetTemplate(
    [
      'Project reviewed. Go/No-Go',
      'Create Internal P/N & PDM folder',
      'Create SharePoint folder',
      'Estimate quote generated & sent to cust.',
      'Customer accepted estimate',
      'Move Project to Stage 1 Engineering',
    ],
    [
      'Define scope & product requirements',
      'RFQ sheet created',
      'Move Project to Production team Quoting',
    ],
    ['Project Closed'],
  ),
  // "Complex Part as Received" column.
  'Complex Project': sheetTemplate(
    [
      'Project reviewed. Go/No-Go',
      'Create Internal P/N & PDM folder',
      'Create SharePoint folder',
      'Estimate quote generated & sent to cust.',
      'Customer accepted estimate',
      'Move Project to Stage 1 Engineering',
    ],
    [
      'Define scope & product requirements',
      'MFL quotation drawing',
      'MFL drawing peer reviewed & approved',
      'Move Project to Production team Quoting',
    ],
    [],
  ),
  // "Milson Development" column.
  'Development Project': sheetTemplate(
    [
      'Project reviewed. Go/No-Go',
      'Create Internal P/N & PDM folder',
      'Create SharePoint folder',
      'Development time quote generated',
      'Estimate quote generated',
      'Development & part estimate quote sent to customer',
      'Customer accepted estimate',
      'Move Project to Stage 1 Engineering',
    ],
    [
      'Define scope & product requirements',
      'Create concept CAD & Drawing',
      'Customer review & accepted design',
      'RFQ sheet created',
      'Move Project to Production team Quoting',
    ],
    [],
  ),
  // "Re-Quote" column.
  'Project Revisit': sheetTemplate(
    [
      'Review Changes. Go/No-Go',
      'Updated files added to PDM',
      'Move Project to Stage 1 Engineering',
    ],
    [
      'Define scope & product requirements',
      'Customer CAD updated',
      'RFQ sheet/drawing updated',
      'MFL drawing peer reviewed & approved (if required)',
      'Move Project to Production team Quoting',
    ],
    [],
  ),
};

/** The sheet-derived checklist for a type (or the standard one for unknown/new types). */
export function defaultTemplate(typeName?: string): TemplateStage[] {
  const template = (typeName ? TYPE_TEMPLATES[typeName] : undefined) ?? TYPE_TEMPLATES['Standard Project'];
  return template.map((stage) => ({ ...stage, tasks: [...stage.tasks] }));
}

/** The type's current editable template (or the default) with its version. */
export async function getTypeTemplate(
  typeId: number | null,
): Promise<{ version: number; stages: TemplateStage[] }> {
  if (typeId == null) return { version: 0, stages: defaultTemplate() };
  const row = await queryOne<{ template: unknown; template_version: number; name: string }>(
    'SELECT template, template_version, name FROM project_types WHERE id = $1',
    [typeId],
  );
  const parsed = templateSchema.shape.stages.safeParse(row?.template);
  if (parsed.success && parsed.data.length > 0) {
    return { version: row!.template_version, stages: parsed.data };
  }
  return { version: row?.template_version ?? 0, stages: defaultTemplate(row?.name) };
}

/** Saves a new template version; existing projects only pick it up via apply-template. */
export async function saveTemplate(
  id: number,
  stages: TemplateStage[],
): Promise<{ version: number; stages: TemplateStage[] }> {
  const row = await queryOne<{ template_version: number }>(
    `UPDATE project_types SET template = $2::jsonb, template_version = template_version + 1
     WHERE id = $1 RETURNING template_version`,
    [id, JSON.stringify(stages)],
  );
  if (!row) throw new HttpError(404, 'Project type not found');
  return { version: row.template_version, stages };
}

/** Active types for pickers; `includeInactive` for the admin manager. */
export async function listProjectTypes(includeInactive = false) {
  const rows = await query<ProjectTypeRow>(
    `SELECT * FROM project_types ${includeInactive ? '' : 'WHERE is_active = TRUE'}
     ORDER BY sort_order, id`,
  );
  return rows.map(toDto);
}

/** The type new projects get when the form sends no explicit choice. */
export async function defaultProjectTypeId(): Promise<number | null> {
  const row = await queryOne<{ id: number }>(
    `SELECT id FROM project_types WHERE is_active = TRUE ORDER BY sort_order, id LIMIT 1`,
  );
  return row?.id ?? null;
}

/** 400s when the id is missing or no longer active — pickers hide it, and so does the API. */
export async function assertProjectTypeAssignable(id: number): Promise<number> {
  const row = await queryOne<{ id: number }>(
    'SELECT id FROM project_types WHERE id = $1 AND is_active = TRUE',
    [id],
  );
  if (!row) throw new HttpError(400, 'Selected project type is not available');
  return row.id;
}

/** Turns a duplicate-name unique violation into a friendly 400. */
async function guardDuplicate<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (err) {
    if ((err as { code?: string }).code === '23505') {
      throw new HttpError(400, 'A project type with that name already exists');
    }
    throw err;
  }
}

export async function createProjectType(input: z.infer<typeof projectTypeSchema>) {
  return guardDuplicate(async () => {
    const row = await queryOne<ProjectTypeRow>(
      `INSERT INTO project_types (name, sort_order)
       VALUES ($1, COALESCE($2, (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM project_types)))
       RETURNING *`,
      [input.name, input.sortOrder ?? null],
    );
    return toDto(row!);
  });
}

export async function updateProjectType(id: number, input: z.infer<typeof projectTypeSchema>) {
  const existing = await queryOne<ProjectTypeRow>('SELECT * FROM project_types WHERE id = $1', [id]);
  if (!existing) throw new HttpError(404, 'Project type not found');
  return guardDuplicate(async () => {
    const row = await queryOne<ProjectTypeRow>(
      `UPDATE project_types SET name = $2, sort_order = $3, is_active = $4 WHERE id = $1 RETURNING *`,
      [id, input.name, input.sortOrder ?? existing.sort_order, input.isActive ?? existing.is_active],
    );
    return toDto(row!);
  });
}

/** Deletes a type; projects keep their row but lose the label (SET NULL). */
export async function deleteProjectType(id: number) {
  const existing = await queryOne('SELECT id FROM project_types WHERE id = $1', [id]);
  if (!existing) throw new HttpError(404, 'Project type not found');
  await query('DELETE FROM project_types WHERE id = $1', [id]);
}
