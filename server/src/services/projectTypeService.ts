import { z } from 'zod';
import { query, queryOne } from '../db/pool';
import { HttpError } from '../middleware/errors';
import { PROJECT_STAGES, STAGE_LABELS } from '../types';
import { STAGE_TASK_TEMPLATES } from './workflowService';

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

/** The standard pipeline checklist, used when a type has no saved template. */
export function defaultTemplate(): TemplateStage[] {
  return PROJECT_STAGES.map((key) => ({
    key,
    label: STAGE_LABELS[key],
    tasks: STAGE_TASK_TEMPLATES[key] ?? [],
  }));
}

/** The type's current editable template (or the default) with its version. */
export async function getTypeTemplate(
  typeId: number | null,
): Promise<{ version: number; stages: TemplateStage[] }> {
  if (typeId == null) return { version: 0, stages: defaultTemplate() };
  const row = await queryOne<{ template: unknown; template_version: number }>(
    'SELECT template, template_version FROM project_types WHERE id = $1',
    [typeId],
  );
  const parsed = templateSchema.shape.stages.safeParse(row?.template);
  if (parsed.success && parsed.data.length > 0) {
    return { version: row!.template_version, stages: parsed.data };
  }
  return { version: row?.template_version ?? 0, stages: defaultTemplate() };
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
