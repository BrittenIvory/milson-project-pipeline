import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { asyncHandler } from '../middleware/errors';
import { listActivity, toActivityDto } from '../services/activityService';

const router = Router();
router.use(requireAuth);

/** Organisation-wide activity feed. */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const records = await listActivity({
      entityType: typeof req.query.entityType === 'string' ? req.query.entityType : undefined,
      entityId: req.query.entityId ? Number(req.query.entityId) : undefined,
      limit: req.query.limit ? Number(req.query.limit) : undefined,
    });
    res.json(records.map(toActivityDto));
  }),
);

export default router;
