import { pool, query } from '../db/pool';
import type { AuthUser } from '../types';

export interface ActivityRecord {
  id: number;
  user_id: number | null;
  user_name: string | null;
  action: string;
  entity_type: string | null;
  entity_id: number | null;
  detail: string | null;
  created_at: string;
}

export interface LogInput {
  actor: AuthUser | null;
  action: string;
  entityType?: string;
  entityId?: number;
  detail?: string;
}

/**
 * Records an auditable action. Logging never blocks the caller's operation:
 * failures are reported but swallowed.
 */
export async function logActivity(input: LogInput): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO activity_logs (user_id, user_name, action, entity_type, entity_id, detail)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        input.actor?.id ?? null,
        input.actor?.fullName ?? null,
        input.action,
        input.entityType ?? null,
        input.entityId ?? null,
        input.detail ?? null,
      ],
    );
  } catch (err) {
    console.error('Failed to write activity log', err);
  }
}

/** Maps a database row to the camelCase API shape. */
export function toActivityDto(row: ActivityRecord) {
  return {
    id: row.id,
    userId: row.user_id,
    userName: row.user_name,
    action: row.action,
    entityType: row.entity_type,
    entityId: row.entity_id,
    detail: row.detail,
    createdAt: row.created_at,
  };
}

/** Lists activity, optionally scoped to a single entity. */
export async function listActivity(options: {
  entityType?: string;
  entityId?: number;
  limit?: number;
}): Promise<ActivityRecord[]> {
  const where: string[] = [];
  const params: unknown[] = [];
  if (options.entityType) {
    params.push(options.entityType);
    where.push(`entity_type = $${params.length}`);
  }
  if (options.entityId) {
    params.push(options.entityId);
    where.push(`entity_id = $${params.length}`);
  }
  params.push(Math.min(options.limit ?? 100, 500));
  return query<ActivityRecord>(
    `SELECT * FROM activity_logs
     ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
     ORDER BY created_at DESC LIMIT $${params.length}`,
    params,
  );
}
