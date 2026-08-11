import { Router } from 'express';
import { requireRole } from '../middleware/auth';
import { asyncHandler, HttpError } from '../middleware/errors';
import { logActivity } from '../services/activityService';
import { notify } from '../services/notificationService';
import { getProject } from '../services/projectService';
import { maybeAdvanceStage } from '../services/workflowService';
import taskCommentsRouter from './taskComments';
import { stageLabel } from '../types';
import type { AuthUser } from '../types';
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

async function notifyStageAdvance(
  project: Awaited<ReturnType<typeof getProject>>,
  actor: AuthUser | undefined,
  projectId: number,
) {
  const advance = await maybeAdvanceStage(projectId);
  if (!advance.advanced) return;
  await logActivity({
    actor: actor ?? null,
    action: 'Stage Updated',
    entityType: 'project',
    entityId: projectId,
    detail: `${project.projectNumber}: ${stageLabel(advance.from ?? '')} → ${stageLabel(advance.to ?? '')} (all tasks complete)`,
  });
  const watchers = new Set(
    [project.assignedEngineerId, project.assignedSalesId].filter(
      (id): id is number => typeof id === 'number',
    ),
  );
  for (const userId of watchers) {
    await notify({
      userId,
      actorId: actor?.id,
      type: 'stage_updated',
      title: 'Project stage updated',
      body: `${project.projectNumber} — ${project.projectName}`,
      projectId,
      entityType: 'project',
      entityId: projectId,
    });
  }
}

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
    const task = await createTask(projectId, taskSchema.parse(req.body), req.user!.id, project.currentStage);
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
    await notifyStageAdvance(project, req.user, projectId);
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
    await notifyStageAdvance(project, req.user, projectId);
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
    await notifyStageAdvance(await getProject(projectId), req.user, projectId);
    res.status(204).end();
  }),
);

router.use('/:taskId/comments', taskCommentsRouter);

export default router;
