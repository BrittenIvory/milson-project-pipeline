import { Router } from 'express';
import { asyncHandler, HttpError } from '../middleware/errors';
import { logActivity } from '../services/activityService';
import {
  createNote,
  deleteNote,
  getNote,
  getNoteAuthorId,
  listNotes,
  noteSchema,
  reactionSchema,
  resolveMentions,
  toggleReaction,
  updateNote,
} from '../services/noteService';
import { notify } from '../services/notificationService';
import { getProject } from '../services/projectService';

// Mounted under /api/projects/:projectId/notes.
const router = Router({ mergeParams: true });

function projectIdOf(params: Record<string, string>): number {
  const id = Number(params.projectId);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, 'Invalid project id');
  return id;
}

/** Only the author (or an administrator) may edit or delete a note. */
function assertCanModify(authorId: number | null, req: { user?: { id: number; role: string } }) {
  const user = req.user!;
  if (user.role !== 'administrator' && authorId !== user.id) {
    throw new HttpError(403, 'You can only modify your own notes');
  }
}

router.get(
  '/',
  asyncHandler(async (req, res) => {
    res.json(await listNotes(projectIdOf(req.params as Record<string, string>)));
  }),
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const projectId = projectIdOf(req.params as Record<string, string>);
    const project = await getProject(projectId);
    const input = noteSchema.parse(req.body);
    const note = await createNote(projectId, input, req.user!.id);
    await logActivity({
      actor: req.user ?? null,
      action: 'Note Added',
      entityType: 'project',
      entityId: projectId,
      detail: note.body.slice(0, 120),
    });
    // The reply notification already reaches the parent author — don't also
    // send them a mention alert if the reply body @tags them.
    const replyRecipient = input.replyToNoteId
      ? await getNoteAuthorId(projectId, input.replyToNoteId)
      : null;
    for (const mention of await resolveMentions(note.body)) {
      if (replyRecipient !== null && mention.id === replyRecipient) continue;
      await notify({
        userId: mention.id,
        actorId: req.user?.id,
        allowSelf: true,
        type: 'note_mention',
        title: `${req.user?.fullName} mentioned you`,
        body: `${project.projectNumber} — ${note.body.slice(0, 120)}`,
        projectId,
        entityType: 'note',
        entityId: note.id,
      });
    }
    if (replyRecipient !== null) {
      await notify({
        userId: replyRecipient,
        actorId: req.user?.id,
        type: 'note_reply',
        title: `${req.user?.fullName} replied to your comment`,
        body: `${project.projectNumber} — ${note.body.slice(0, 120)}`,
        projectId,
        entityType: 'note',
        entityId: note.id,
      });
    }
    res.status(201).json(note);
  }),
);

router.put(
  '/:noteId',
  asyncHandler(async (req, res) => {
    const projectId = projectIdOf(req.params as Record<string, string>);
    const existing = await getNote(projectId, Number(req.params.noteId));
    assertCanModify(existing.authorId, req);
    res.json(await updateNote(projectId, existing.id, noteSchema.parse(req.body)));
  }),
);

router.put(
  '/:noteId/reactions',
  asyncHandler(async (req, res) => {
    const projectId = projectIdOf(req.params as Record<string, string>);
    const noteId = Number(req.params.noteId);
    if (!Number.isInteger(noteId) || noteId <= 0) throw new HttpError(400, 'Invalid comment id');
    const { emoji } = reactionSchema.parse(req.body);
    res.json(await toggleReaction(projectId, noteId, emoji, req.user!.id));
  }),
);

router.delete(
  '/:noteId',
  asyncHandler(async (req, res) => {
    const projectId = projectIdOf(req.params as Record<string, string>);
    const existing = await getNote(projectId, Number(req.params.noteId));
    assertCanModify(existing.authorId, req);
    await deleteNote(projectId, existing.id);
    await logActivity({
      actor: req.user ?? null,
      action: 'Note Deleted',
      entityType: 'project',
      entityId: projectId,
      detail: existing.body.slice(0, 120),
    });
    res.status(204).end();
  }),
);

export default router;
