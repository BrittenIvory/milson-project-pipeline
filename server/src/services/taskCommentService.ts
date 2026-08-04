import { z } from 'zod';
import { pool, query, queryOne } from '../db/pool';
import { HttpError } from '../middleware/errors';

export interface TaskCommentRow {
  id: number;
  task_id: number;
  author_id: number | null;
  body: string;
  created_at: string;
  updated_at: string;
  author_name?: string | null;
}

export const commentSchema = z.object({
  body: z.string().trim().min(1, 'Comment cannot be empty').max(5000),
});

const SELECT_COMMENT = `
  SELECT c.*, u.full_name AS author_name
  FROM task_comments c LEFT JOIN users u ON u.id = c.author_id`;

export function toCommentDto(row: TaskCommentRow) {
  return {
    id: row.id,
    taskId: row.task_id,
    authorId: row.author_id,
    authorName: row.author_name ?? null,
    body: row.body,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listComments(taskId: number) {
  const rows = await query<TaskCommentRow>(
    `${SELECT_COMMENT} WHERE c.task_id = $1 ORDER BY c.created_at ASC`,
    [taskId],
  );
  return rows.map(toCommentDto);
}

export async function getComment(taskId: number, id: number) {
  const row = await queryOne<TaskCommentRow>(
    `${SELECT_COMMENT} WHERE c.id = $1 AND c.task_id = $2`,
    [id, taskId],
  );
  if (!row) throw new HttpError(404, 'Comment not found');
  return toCommentDto(row);
}

export async function createComment(taskId: number, body: string, authorId: number) {
  const inserted = await queryOne<{ id: number }>(
    'INSERT INTO task_comments (task_id, author_id, body) VALUES ($1,$2,$3) RETURNING id',
    [taskId, authorId, body],
  );
  return getComment(taskId, (inserted as { id: number }).id);
}

export async function updateComment(taskId: number, id: number, body: string) {
  await getComment(taskId, id);
  await pool.query(
    'UPDATE task_comments SET body = $3, updated_at = NOW() WHERE id = $1 AND task_id = $2',
    [id, taskId, body],
  );
  return getComment(taskId, id);
}

export async function deleteComment(taskId: number, id: number) {
  const row = await queryOne<TaskCommentRow>(
    'DELETE FROM task_comments WHERE id = $1 AND task_id = $2 RETURNING *',
    [id, taskId],
  );
  if (!row) throw new HttpError(404, 'Comment not found');
  return toCommentDto(row);
}
