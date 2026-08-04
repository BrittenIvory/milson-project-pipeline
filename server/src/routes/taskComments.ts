import { Router } from 'express';
import { asyncHandler, HttpError } from '../middleware/errors';
import { logActivity } from '../services/activityService';
import { getProject } from '../services/projectService';
import { notify } from '../services/notificationService';
import { resolveMentions } from '../services/noteService';
import { getTask } from '../services/taskService';
import {
  commentSchema,
  createComment,
  deleteComment,
  getComment,
  listComments,
  updateComment,
} from '../services/taskCommentService';

const router = Router({ mergeParams: true });

function idOf(value: unknown, label: string): number {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, `Invalid ${label}`);
  return id;
}

function assertCanModify(authorId: number | null, req: { user?: { id: number; role: string } }) {
  const user = req.user!;
  if (user.role !== 'administrator' && authorId !== user.id) {
    throw new HttpError(403, 'You can only modify your own comments');
  }
}

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const projectId = idOf(req.params.projectId, 'project id');
    const taskId = idOf(req.params.taskId, 'task id');
    await getTask(projectId, taskId);
    res.json(await listComments(taskId));
  }),
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const taskId = idOf(req.params.taskId, 'task id');
    const projectId = idOf(req.params.projectId, 'project id');
    const task = await getTask(projectId, taskId);
    const project = await getProject(projectId);
    const input = commentSchema.parse(req.body);
    const comment = await createComment(taskId, input.body, req.user!.id);
    await logActivity({
      actor: req.user ?? null,
      action: 'Comment Added',
      entityType: 'project',
      entityId: projectId,
      detail: `${task.taskName}: ${input.body.slice(0, 120)}`,
    });
    for (const mention of await resolveMentions(input.body)) {
      await notify({
        userId: mention.id,
        actorId: req.user!.id,
        type: 'comment_mention',
        title: `${req.user!.fullName} mentioned you`,
        body: `${project.projectNumber} — ${task.taskName}: ${input.body.slice(0, 120)}`,
        projectId,
        entityType: 'task',
        entityId: taskId,
      });
    }
    res.status(201).json(comment);
  }),
);

router.put(
  '/:commentId',
  asyncHandler(async (req, res) => {
    const projectId = idOf(req.params.projectId, 'project id');
    const taskId = idOf(req.params.taskId, 'task id');
    const commentId = idOf(req.params.commentId, 'comment id');
    await getTask(projectId, taskId);
    const existing = await getComment(taskId, commentId);
    assertCanModify(existing.authorId, req);
    res.json(await updateComment(taskId, commentId, commentSchema.parse(req.body).body));
  }),
);

router.delete(
  '/:commentId',
  asyncHandler(async (req, res) => {
    const projectId = idOf(req.params.projectId, 'project id');
    const taskId = idOf(req.params.taskId, 'task id');
    const commentId = idOf(req.params.commentId, 'comment id');
    await getTask(projectId, taskId);
    const existing = await getComment(taskId, commentId);
    assertCanModify(existing.authorId, req);
    await deleteComment(taskId, commentId);
    res.status(204).end();
  }),
);

export default router;
