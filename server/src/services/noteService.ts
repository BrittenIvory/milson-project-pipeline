import { z } from 'zod';
import { pool, query, queryOne } from '../db/pool';
import { HttpError } from '../middleware/errors';

export interface NoteRow {
  id: number;
  project_id: number;
  author_id: number | null;
  reply_to_note_id: number | null;
  body: string;
  created_at: string;
  updated_at: string;
  author_name?: string | null;
  reply_to_author_name?: string | null;
  reply_to_body?: string | null;
}

export const noteSchema = z.object({
  body: z.string().trim().min(1, 'Note cannot be empty').max(5000),
  replyToNoteId: z.number().int().positive().optional(),
});

export type NoteInput = z.infer<typeof noteSchema>;

const SELECT_NOTE = `
  SELECT n.*, u.full_name AS author_name,
         pn.body AS reply_to_body, pu.full_name AS reply_to_author_name
  FROM project_notes n
  LEFT JOIN users u ON u.id = n.author_id
  LEFT JOIN project_notes pn ON pn.id = n.reply_to_note_id
  LEFT JOIN users pu ON pu.id = pn.author_id`;

/** Emojis users may react with; anything else is rejected. */
export const REACTION_EMOJIS = ['👍', '❤️', '🎉', '✅', '👀'] as const;

export const reactionSchema = z.object({
  emoji: z.enum(REACTION_EMOJIS),
});

export interface NoteReaction {
  emoji: string;
  userIds: number[];
}

async function reactionsFor(noteIds: number[]): Promise<Map<number, NoteReaction[]>> {
  const map = new Map<number, NoteReaction[]>();
  if (noteIds.length === 0) return map;
  const rows = await query<{ note_id: number; emoji: string; user_ids: number[] }>(
    `SELECT note_id, emoji, array_agg(user_id ORDER BY user_id) AS user_ids
     FROM note_reactions WHERE note_id = ANY($1)
     GROUP BY note_id, emoji ORDER BY MIN(created_at)`,
    [noteIds],
  );
  for (const row of rows) {
    const list = map.get(row.note_id) ?? [];
    list.push({ emoji: row.emoji, userIds: row.user_ids });
    map.set(row.note_id, list);
  }
  return map;
}

export function toNoteDto(row: NoteRow, reactions: NoteReaction[] = []) {
  return {
    id: row.id,
    projectId: row.project_id,
    authorId: row.author_id,
    authorName: row.author_name ?? null,
    body: row.body,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    replyToId: row.reply_to_note_id ?? null,
    replyToAuthorName: row.reply_to_author_name ?? null,
    replyToPreview: row.reply_to_body ? row.reply_to_body.slice(0, 120) : null,
    reactions,
  };
}

export async function listNotes(projectId: number) {
  const rows = await query<NoteRow>(
    `${SELECT_NOTE} WHERE n.project_id = $1 ORDER BY n.created_at ASC`,
    [projectId],
  );
  const reactions = await reactionsFor(rows.map((row) => row.id));
  return rows.map((row) => toNoteDto(row, reactions.get(row.id) ?? []));
}

export async function getNote(projectId: number, id: number) {
  const row = await queryOne<NoteRow>(`${SELECT_NOTE} WHERE n.id = $1 AND n.project_id = $2`, [
    id,
    projectId,
  ]);
  if (!row) throw new HttpError(404, 'Note not found');
  const reactions = await reactionsFor([row.id]);
  return toNoteDto(row, reactions.get(row.id) ?? []);
}

/** Adds the user's reaction, or removes it if they already reacted with it. */
export async function toggleReaction(
  projectId: number,
  noteId: number,
  emoji: string,
  userId: number,
) {
  await getNote(projectId, noteId);
  const removed = await queryOne<{ id: number }>(
    'DELETE FROM note_reactions WHERE note_id = $1 AND user_id = $2 AND emoji = $3 RETURNING id',
    [noteId, userId, emoji],
  );
  if (!removed) {
    await pool.query(
      'INSERT INTO note_reactions (note_id, user_id, emoji) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING',
      [noteId, userId, emoji],
    );
  }
  return getNote(projectId, noteId);
}

/** Returns the note's author id, or null when the note is gone or anonymous — never throws. */
export async function getNoteAuthorId(
  projectId: number,
  noteId: number,
): Promise<number | null> {
  const row = await queryOne<{ author_id: number | null }>(
    'SELECT author_id FROM project_notes WHERE id = $1 AND project_id = $2',
    [noteId, projectId],
  );
  return row ? row.author_id : null;
}

export async function createNote(projectId: number, input: NoteInput, authorId: number) {
  // A stale reply target (parent deleted after the composer opened) degrades
  // to a standalone comment rather than rejecting the post.
  const replyToNoteId = input.replyToNoteId
    ? (
        await queryOne<{ id: number }>(
          'SELECT id FROM project_notes WHERE id = $1 AND project_id = $2',
          [input.replyToNoteId, projectId],
        )
      )?.id ?? null
    : null;
  const inserted = await queryOne<{ id: number }>(
    'INSERT INTO project_notes (project_id, author_id, body, reply_to_note_id) VALUES ($1,$2,$3,$4) RETURNING id',
    [projectId, authorId, input.body, replyToNoteId],
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

export interface MentionUser {
  id: number;
  fullName: string;
  email: string;
}

/**
 * Pure mention matcher. `@mentions` resolve against each user's full name and
 * email local part. Accepts full names (`@Ada Lovelace`), dotted/hyphenated
 * forms (`@ada.lovelace`, `@ada-lovelace`), first names (`@ada`), first token
 * of the email local part, and full emails (`@ada@example.com` — the domain
 * is dropped before matching).
 */
export function matchMentions(body: string, users: MentionUser[]): { id: number; fullName: string }[] {
  const captures = [...body.matchAll(/@([\w.@-]+(?: [A-Za-z-]+)?)/g)]
    .map((m) => {
      let h = m[1].toLowerCase();
      if (h.includes('@')) h = h.split('@')[0];
      return h.replace(/[.\s_-]+/g, ' ').trim();
    })
    .filter(Boolean);
  if (captures.length === 0) return [];

  const matches = (handles: string[]) =>
    users.filter((u) => {
      const name = u.fullName.toLowerCase().replace(/[._-]+/g, ' ').trim();
      const local = u.email.split('@')[0].toLowerCase().replace(/[._-]+/g, ' ').trim();
      const firstName = name.split(' ')[0];
      const firstLocal = local.split(' ')[0];
      return handles.some(
        (h) =>
          h === name ||
          h === local ||
          h === firstName ||
          h === firstLocal ||
          name.startsWith(h),
      );
    });

  // Full captures first; the first-token fallback only applies to a capture
  // that matched nobody — otherwise `@Devin Verify` would also notify every
  // other Devin via the `devin` fallback.
  const matched = new Map<number, string>();
  const misses: string[] = [];
  for (const h of new Set(captures)) {
    const hits = matches([h]);
    if (hits.length > 0) hits.forEach((u) => matched.set(u.id, u.fullName));
    else misses.push(h.split(' ')[0]);
  }
  for (const u of matches(misses)) matched.set(u.id, u.fullName);
  return [...matched.entries()].map(([id, fullName]) => ({ id, fullName }));
}

/** Resolves `@mentions` in a note body to active user ids via matchMentions. */
export async function resolveMentions(body: string): Promise<{ id: number; fullName: string }[]> {
  const rows = await query<{ id: number; full_name: string; email: string }>(
    'SELECT id, full_name, email FROM users WHERE is_active = TRUE',
  );
  return matchMentions(
    body,
    rows.map((row) => ({ id: row.id, fullName: row.full_name, email: row.email })),
  );
}
