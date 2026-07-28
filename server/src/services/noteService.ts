import { z } from 'zod';
import { pool, query, queryOne } from '../db/pool';
import { HttpError } from '../middleware/errors';

export interface NoteRow {
  id: number;
  project_id: number;
  author_id: number | null;
  body: string;
  created_at: string;
  updated_at: string;
  author_name?: string | null;
}

export const noteSchema = z.object({
  body: z.string().trim().min(1, 'Note cannot be empty').max(5000),
});

export type NoteInput = z.infer<typeof noteSchema>;

const SELECT_NOTE = `
  SELECT n.*, u.full_name AS author_name
  FROM project_notes n LEFT JOIN users u ON u.id = n.author_id`;

export function toNoteDto(row: NoteRow) {
  return {
    id: row.id,
    projectId: row.project_id,
    authorId: row.author_id,
    authorName: row.author_name ?? null,
    body: row.body,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listNotes(projectId: number) {
  const rows = await query<NoteRow>(
    `${SELECT_NOTE} WHERE n.project_id = $1 ORDER BY n.created_at DESC`,
    [projectId],
  );
  return rows.map(toNoteDto);
}

export async function getNote(projectId: number, id: number) {
  const row = await queryOne<NoteRow>(`${SELECT_NOTE} WHERE n.id = $1 AND n.project_id = $2`, [
    id,
    projectId,
  ]);
  if (!row) throw new HttpError(404, 'Note not found');
  return toNoteDto(row);
}

export async function createNote(projectId: number, input: NoteInput, authorId: number) {
  const inserted = await queryOne<{ id: number }>(
    'INSERT INTO project_notes (project_id, author_id, body) VALUES ($1,$2,$3) RETURNING id',
    [projectId, authorId, input.body],
  );
  return getNote(projectId, (inserted as { id: number }).id);
}

export async function updateNote(projectId: number, id: number, input: NoteInput) {
  await getNote(projectId, id);
  await pool.query(
    'UPDATE project_notes SET body = $3, updated_at = NOW() WHERE id = $1 AND project_id = $2',
    [id, projectId, input.body],
  );
  return getNote(projectId, id);
}

export async function deleteNote(projectId: number, id: number) {
  const row = await queryOne<NoteRow>(
    'DELETE FROM project_notes WHERE id = $1 AND project_id = $2 RETURNING *',
    [id, projectId],
  );
  if (!row) throw new HttpError(404, 'Note not found');
  return toNoteDto(row);
}

/**
 * Resolves `@mentions` in a note body to user ids. Names are matched against
 * the mention-friendly form of each user's full name (`@Ada Lovelace` and
 * `@ada.lovelace` both resolve), and email local parts are matched too.
 */
export async function resolveMentions(body: string): Promise<{ id: number; fullName: string }[]> {
  const handles = [...body.matchAll(/@([\w.@-]+(?: [A-Za-z-]+)?)/g)].map((m) =>
    m[1].toLowerCase().replace(/[.\s]+/g, ' ').trim(),
  );
  if (handles.length === 0) return [];
  const rows = await query<{ id: number; full_name: string; email: string }>(
    'SELECT id, full_name, email FROM users WHERE is_active = TRUE',
  );
  const matched = rows.filter((row) => {
    const name = row.full_name.toLowerCase();
    const local = row.email.split('@')[0].toLowerCase().replace(/[._-]+/g, ' ');
    return handles.some((handle) => handle === name || handle === local || name.startsWith(handle));
  });
  return matched.map((row) => ({ id: row.id, fullName: row.full_name }));
}
