import { Router } from 'express';
import { requirePermission } from '../middleware/auth';
import { asyncHandler, HttpError } from '../middleware/errors';
import { getPart, listParts } from '../services/partService';

const router = Router();
router.use(requirePermission('projects.view'));

/** All distinct parts across projects. */
router.get(
  '/',
  asyncHandler(async (_req, res) => {
    res.json({ items: await listParts() });
  }),
);

/** One part and its projects. The number arrives as a query param so part
    numbers containing '/' still resolve. */
router.get(
  '/detail',
  asyncHandler(async (req, res) => {
    const partNumber = String(req.query.partNumber ?? '');
    if (!partNumber) throw new HttpError(400, 'partNumber is required');
    res.json(await getPart(partNumber));
  }),
);

export default router;
