import { z } from 'zod';
import { pool, query, queryOne } from '../db/pool';
import { HttpError } from '../middleware/errors';
import { PRIORITIES, TASK_STATUSES } from '../types';

export interface TaskRow {
  id: number;
  project_id: number;
  stage: string | null;
  task_name: string;
  description: string | null;
  assigned_user_id: number | null;
  due_date: string | null;
  priority: string;
  status: string;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  assigned_user_name?: string | null;
}

const emptyToNull = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((value) => (value === '' || value === undefined ? null : value), schema.nullable());

export const taskSchema = z.object({
  taskName: z.string().trim().min(1, 'Task name is required').max(200),
  description: z.string().trim().max(5000).optional().nullable(),
  assignedUserId: emptyToNull(z.coerce.number().int().positive()).optional(),
  dueDate: emptyToNull(z.string()).optional(),
  priority: z.enum(PRIORITIES).default('medium'),
  status: z.enum(TASK_STATUSES).default('not_started'),
});

export type TaskInput = z.infer<typeof taskSchema>;

const SELECT_TASK = `
  SELECT t.*, u.full_name AS assigned_user_name
  FROM tasks t LEFT JOIN users u ON u.id = t.assigned_user_id`;

/** Maps a joined task row to the camelCase API shape. */
export function toTaskDto(row: TaskRow) {
  return {
    id: row.id,
    projectId: row.project_id,
    taskName: row.task_name,
    description: row.description,
    assignedUserId: row.assigned_user_id,
    assignedUserName: row.assigned_user_name ?? null,
    dueDate: row.due_date,
    priority: row.priority,
    status: row.status,
    stage: row.stage,
    completedAt: row.completed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listTasks(projectId: number) {
  const rows = await query<TaskRow>(
    `${SELECT_TASK} WHERE t.project_id = $1
     ORDER BY (t.status IN ('completed','not_applicable')), t.due_date NULLS LAST, t.id`,
    [projectId],
  );
  return rows.map(toTaskDto);
}

export async function getTask(projectId: number, id: number) {
  const row = await queryOne<TaskRow>(`${SELECT_TASK} WHERE t.id = $1 AND t.project_id = $2`, [
    id,
    projectId,
  ]);
  if (!row) throw new HttpError(404, 'Task not found');
  return toTaskDto(row);
}

export async function createTask(projectId: number, input: TaskInput, createdBy: number, stage: string) {
  const inserted = await queryOne<{ id: number }>(
    `INSERT INTO tasks (project_id, task_name, description, assigned_user_id, due_date, priority,
       status, completed_at, created_by, stage)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
    [
      projectId,
      input.taskName,
      input.description ?? null,
      input.assignedUserId ?? null,
      input.dueDate ?? null,
      input.priority,
      input.status,
      input.status === 'completed' ? new Date().toISOString() : null,
      createdBy,
      stage,
    ],
  );
  return getTask(projectId, (inserted as { id: number }).id);
}

export async function updateTask(projectId: number, id: number, input: TaskInput) {
  const existing = await getTask(projectId, id);
  const completedAt =
    input.status === 'completed'
      ? existing.completedAt ?? new Date().toISOString()
      : null;
  await pool.query(
    `UPDATE tasks SET task_name=$3, description=$4, assigned_user_id=$5, due_date=$6, priority=$7,
       status=$8, completed_at=$9, updated_at=NOW()
     WHERE id=$1 AND project_id=$2`,
    [
      id,
      projectId,
      input.taskName,
      input.description ?? null,
      input.assignedUserId ?? null,
      input.dueDate ?? null,
      input.priority,
      input.status,
      completedAt,
    ],
  );
  return getTask(projectId, id);
}

export async function deleteTask(projectId: number, id: number) {
  const row = await queryOne<TaskRow>(
    'DELETE FROM tasks WHERE id = $1 AND project_id = $2 RETURNING *',
    [id, projectId],
  );
  if (!row) throw new HttpError(404, 'Task not found');
  return toTaskDto(row);
}
