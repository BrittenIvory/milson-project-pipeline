import { pool, query } from '../db/pool';

export interface NotificationRow {
  id: number;
  user_id: number;
  type: string;
  title: string;
  body: string | null;
  project_id: number | null;
  entity_type: string | null;
  entity_id: number | null;
  read_at: string | null;
  created_at: string;
}

export interface NotifyInput {
  userId: number | null | undefined;
  type: string;
  title: string;
  body?: string | null;
  projectId?: number | null;
  entityType?: string;
  entityId?: number;
  /** Suppresses self-notifications (e.g. assigning a task to yourself). */
  actorId?: number | null;
}

/**
 * Creates an in-app notification. Like activity logging this is best-effort:
 * a failure here must never fail the user's action.
 */
export async function notify(input: NotifyInput): Promise<void> {
  if (!input.userId || input.userId === input.actorId) return;
  try {
    await pool.query(
      `INSERT INTO notifications (user_id, type, title, body, project_id, entity_type, entity_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [
        input.userId,
        input.type,
        input.title,
        input.body ?? null,
        input.projectId ?? null,
        input.entityType ?? null,
        input.entityId ?? null,
      ],
    );
  } catch (err) {
    console.error('Failed to write notification', err);
  }
}

export function toNotificationDto(row: NotificationRow) {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    body: row.body,
    projectId: row.project_id,
    entityType: row.entity_type,
    entityId: row.entity_id,
    readAt: row.read_at,
    createdAt: row.created_at,
  };
}

export async function listNotifications(userId: number, unreadOnly = false) {
  const rows = await query<NotificationRow>(
    `SELECT * FROM notifications
     WHERE user_id = $1 ${unreadOnly ? 'AND read_at IS NULL' : ''}
     ORDER BY created_at DESC LIMIT 50`,
    [userId],
  );
  return rows.map(toNotificationDto);
}

export async function unreadCount(userId: number): Promise<number> {
  const rows = await query<{ count: string }>(
    'SELECT COUNT(*)::text AS count FROM notifications WHERE user_id = $1 AND read_at IS NULL',
    [userId],
  );
  return Number(rows[0]?.count ?? 0);
}

export async function markRead(userId: number, id: number): Promise<void> {
  await pool.query(
    'UPDATE notifications SET read_at = NOW() WHERE id = $1 AND user_id = $2 AND read_at IS NULL',
    [id, userId],
  );
}

export async function markAllRead(userId: number): Promise<void> {
  await pool.query('UPDATE notifications SET read_at = NOW() WHERE user_id = $1 AND read_at IS NULL', [
    userId,
  ]);
}

/**
 * Creates due-tomorrow and overdue reminders for open tasks, skipping any that
 * were already sent for the same task and day. Runs on a timer at boot so the
 * app needs no external scheduler.
 */
export async function sweepTaskDueNotifications(): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO notifications (user_id, type, title, body, project_id, entity_type, entity_id)
       SELECT t.assigned_user_id,
              CASE WHEN t.due_date < CURRENT_DATE THEN 'task_overdue' ELSE 'task_due_tomorrow' END,
              CASE WHEN t.due_date < CURRENT_DATE THEN 'Task overdue' ELSE 'Task due tomorrow' END,
              p.project_number || ' — ' || t.task_name,
              t.project_id, 'task', t.id
       FROM tasks t
       JOIN projects p ON p.id = t.project_id
       WHERE t.assigned_user_id IS NOT NULL
         AND t.status NOT IN ('completed','cancelled')
         AND t.due_date IS NOT NULL
         AND t.due_date <= CURRENT_DATE + 1
         AND NOT EXISTS (
           SELECT 1 FROM notifications n
           WHERE n.user_id = t.assigned_user_id
             AND n.entity_type = 'task' AND n.entity_id = t.id
             AND n.type IN ('task_overdue','task_due_tomorrow')
             AND n.created_at >= CURRENT_DATE
         )`,
    );
  } catch (err) {
    console.error('Failed to sweep task due notifications', err);
  }
}
