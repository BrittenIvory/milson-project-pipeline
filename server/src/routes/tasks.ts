import { Router } from 'express';
import { requireRole } from '../middleware/auth';
import { asyncHandler, HttpError } from '../middleware/errors';
import { logActivity } from '../services/activityService';
import { notify } from '../services/notificationService';
import { getProject } from '../services/projectService';
import {
  createTask,
  deleteTask,
  getTask,
  listTasks,
  taskSchema,
  updateTask,
} from '../services/taskService';

// Mounted under /api/projects/:projectId/tasks.
const router = Router({ mergeParams: true });

const canManageTasks = requireRole('engineering', 'sales', 'production', 'quality');

function projectIdOf(params: Record<string, string>): number {
  const id = Number(params.projectId);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, 'Invalid project id');
  return id;
}

router.get(
  '/',
  asyncHandler(async (req, res) => {
    res.json(await listTasks(projectIdOf(req.params as Record<string, string>)));
  }),
);

router.post(
  '/',
  canManageTasks,
  asyncHandler(async (req, res) => {
    const projectId = projectIdOf(req.params as Record<string, string>);
    const project = await getProject(projectId);
    const task = await createTask(projectId, taskSchema.parse(req.body), req.user!.id);
    await logActivity({
      actor: req.user ?? null,
      action: 'Task Created',
      entityType: 'project',
      entityId: projectId,
      detail: task.taskName,
    });
    if (task.assignedUserId) {
      await notify({
        userId: task.assignedUserId,
        actorId: req.user?.id,
        type: 'task_assigned',
        title: 'Task assigned to you',
        body: `${project.projectNumber} — ${task.taskName}`,
        projectId,
        entityType: 'task',
        entityId: task.id,
      });
    }
    res.status(201).json(task);
  }),
);

router.put(
  '/:taskId',
  canManageTasks,
  asyncHandler(async (req, res) => {
    const projectId = projectIdOf(req.params as Record<string, string>);
    const project = await getProject(projectId);
    const before = await getTask(projectId, Number(req.params.taskId));
    const task = await updateTask(projectId, before.id, taskSchema.parse(req.body));

    const completed = task.status === 'completed' && before.status !== 'completed';
    await logActivity({
      actor: req.user ?? null,
      action: completed ? 'Task Completed' : 'Task Updated',
      entityType: 'project',
      entityId: projectId,
      detail: task.taskName,
    });
    if (task.assignedUserId && task.assignedUserId !== before.assignedUserId) {
      await logActivity({
        actor: req.user ?? null,
        action: 'User Assigned',
        entityType: 'project',
        entityId: projectId,
        detail: `${task.assignedUserName} → ${task.taskName}`,
      });
      await notify({
        userId: task.assignedUserId,
        actorId: req.user?.id,
        type: 'task_assigned',
        title: 'Task assigned to you',
        body: `${project.projectNumber} — ${task.taskName}`,
        projectId,
        entityType: 'task',
        entityId: task.id,
      });
    }
    res.json(task);
  }),
);

router.delete(
  '/:taskId',
  canManageTasks,
  asyncHandler(async (req, res) => {
    const projectId = projectIdOf(req.params as Record<string, string>);
    const task = await deleteTask(projectId, Number(req.params.taskId));
    await logActivity({
      actor: req.user ?? null,
      action: 'Task Deleted',
      entityType: 'project',
      entityId: projectId,
      detail: task.taskName,
    });
    res.status(204).end();
  }),
);

export default router;
