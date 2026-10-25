import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { asyncHandler } from '../middleware/errors';
import {
  archiveAll,
  listNotifications,
  markAllRead,
  markRead,
  setArchived,
  unreadCount,
} from '../services/notificationService';

const router = Router();
router.use(requireAuth);

/** The signed-in user's notifications, newest first. */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    const [items, unread] = await Promise.all([
      listNotifications(
        userId,
        req.query.unread === 'true',
        req.query.archived === 'true',
      ),
      unreadCount(userId),
    ]);
    res.json({ items, unread });
  }),
);

router.post(
  '/read-all',
  asyncHandler(async (req, res) => {
    await markAllRead(req.user!.id);
    res.status(204).end();
  }),
);

router.post(
  '/:id/read',
  asyncHandler(async (req, res) => {
    await markRead(req.user!.id, Number(req.params.id));
    res.status(204).end();
  }),
);

router.post(
  '/archive-all',
  asyncHandler(async (req, res) => {
    await archiveAll(req.user!.id);
    res.status(204).end();
  }),
);

router.post(
  '/:id/archive',
  asyncHandler(async (req, res) => {
    await setArchived(req.user!.id, Number(req.params.id), true);
    res.status(204).end();
  }),
);

router.post(
  '/:id/unarchive',
  asyncHandler(async (req, res) => {
    await setArchived(req.user!.id, Number(req.params.id), false);
    res.status(204).end();
  }),
);

export default router;
