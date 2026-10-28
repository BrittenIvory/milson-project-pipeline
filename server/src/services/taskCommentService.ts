import { z } from 'zod';
import { pool, query, queryOne } from '../db/pool';
import { HttpError } from '../middleware/errors';
import type { NoteReaction } from './noteService';
import { REACTION_EMOJIS } from './noteService';

export interface TaskCommentRow {
  id: number;
  task_id: number;
  author_id: number | null;
  body: string;
  reply_to_comment_id: number | null;
  created_at: string;
  updated_at: string;
  author_name?: string | null;
}

export const commentSchema = z.object({
  body: z.string().trim().min(1, 'Comment cannot be empty').max(5000),
  replyToCommentId: z.number().int().positive().optional(),
});

export const reactionSchema = z.object({
  emoji: z.enum(REACTION_EMOJIS),
});

const SELECT_COMMENT = `
  SELECT c.*, u.full_name AS author_name
  FROM task_comments c LEFT JOIN users u ON u.id = c.author_id`;

async function reactionsFor(commentIds: number[]): Promise<Map<number, NoteReaction[]>> {
  const map = new Map<number, NoteReaction[]>();
  if (commentIds.length === 0) return map;
  const rows = await query<{ comment_id: number; emoji: string; user_ids: number[] }>(
    `SELECT comment_id, emoji, array_agg(user_id ORDER BY user_id) AS user_ids
     FROM task_comment_reactions WHERE comment_id = ANY($1)
     GROUP BY comment_id, emoji ORDER BY MIN(created_at)`,
    [commentIds],
  );
  for (const row of rows) {
    const list = map.get(row.comment_id) ?? [];
    list.push({ emoji: row.emoji, userIds: row.user_ids });
    map.set(row.comment_id, list);
  }
  return map;
}

export function toCommentDto(row: TaskCommentRow, reactions: NoteReaction[] = []) {
  return {
    id: row.id,
    taskId: row.task_id,
    authorId: row.author_id,
    authorName: row.author_name ?? null,
    body: row.body,
    replyToId: row.reply_to_comment_id ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    reactions,
  };
}

export async function listComments(taskId: number) {
  const rows = await query<TaskCommentRow>(
    `${SELECT_COMMENT} WHERE c.task_id = $1 ORDER BY c.created_at ASC`,
    [taskId],
  );
  const reactions = await reactionsFor(rows.map((row) => row.id));
  return rows.map((row) => toCommentDto(row, reactions.get(row.id) ?? []));
}

export async function getComment(taskId: number, id: number) {
  const row = await queryOne<TaskCommentRow>(
    `${SELECT_COMMENT} WHERE c.id = $1 AND c.task_id = $2`,
    [id, taskId],
  );
  if (!row) throw new HttpError(404, 'Comment not found');
  const reactions = await reactionsFor([row.id]);
  return toCommentDto(row, reactions.get(row.id) ?? []);
}

/** Returns the comment's author id, or null when anonymous — never throws for a missing row. */
export async function getCommentAuthorId(
  taskId: number,
  commentId: number,
): Promise<number | null> {
  const row = await queryOne<{ author_id: number | null }>(
    'SELECT author_id FROM task_comments WHERE id = $1 AND task_id = $2',
    [commentId, taskId],
  );
  return row?.author_id ?? null;
}

export async function createComment(
  taskId: number,
  body: string,
  authorId: number,
  replyToCommentId: number | null = null,
) {
  // A stale reply target (parent deleted after the composer opened) degrades
  // to a standalone comment rather than failing the post.
  let parentId: number | null = null;
  if (replyToCommentId !== null) {
    const parent = await queryOne<{ id: number }>(
      'SELECT id FROM task_comments WHERE id = $1 AND task_id = $2',
      [replyToCommentId, taskId],
    );
    parentId = parent?.id ?? null;
  }
  const inserted = await queryOne<{ id: number }>(
    'INSERT INTO task_comments (task_id, author_id, body, reply_to_comment_id) VALUES ($1,$2,$3,$4) RETURNING id',
    [taskId, authorId, body, parentId],
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

/** Adds the user's reaction, or removes it if they already reacted with it. */
export async function toggleReaction(taskId: number, commentId: number, emoji: string, userId: number) {
  await getComment(taskId, commentId);
  const removed = await queryOne<{ id: number }>(
    'DELETE FROM task_comment_reactions WHERE comment_id = $1 AND user_id = $2 AND emoji = $3 RETURNING id',
    [commentId, userId, emoji],
  );
  if (!removed) {
    await pool.query(
      'INSERT INTO task_comment_reactions (comment_id, user_id, emoji) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING',
      [commentId, userId, emoji],
    );
  }
  return getComment(taskId, commentId);
}

export async function deleteComment(taskId: number, id: number) {
  const row = await queryOne<TaskCommentRow>(
    'DELETE FROM task_comments WHERE id = $1 AND task_id = $2 RETURNING *',
    [id, taskId],
  );
  if (!row) throw new HttpError(404, 'Comment not found');
  return toCommentDto(row);
}
