import { Router } from 'express';
import { query } from '../db/pool';
import { requireAuth } from '../middleware/auth';
import { asyncHandler } from '../middleware/errors';
import type { Role } from '../types';

const router = Router();
router.use(requireAuth);

/** Lists active users, used to populate assignment dropdowns. */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const role = typeof req.query.role === 'string' ? req.query.role : undefined;
    const rows = await query<{ id: number; full_name: string; email: string; role: Role }>(
      `SELECT id, full_name, email, role FROM users
       WHERE is_active = TRUE ${role ? 'AND role = $1' : ''}
       ORDER BY full_name`,
      role ? [role] : [],
    );
    res.json(rows.map((r) => ({ id: r.id, fullName: r.full_name, email: r.email, role: r.role })));
  }),
);

export default router;
