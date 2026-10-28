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
