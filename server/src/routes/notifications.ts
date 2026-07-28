import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { asyncHandler } from '../middleware/errors';
import {
  listNotifications,
  markAllRead,
  markRead,
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
      listNotifications(userId, req.query.unread === 'true'),
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

export default router;
