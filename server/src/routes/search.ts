import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { asyncHandler } from '../middleware/errors';
import { listCustomers } from '../services/customerService';
import { listProjects } from '../services/projectService';

const router = Router();
router.use(requireAuth);

/**
 * Global search across project number, project name, customer and part numbers.
 */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const term = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    if (!term) {
      res.json({ projects: [], customers: [] });
      return;
    }
    const [projects, customers] = await Promise.all([
      listProjects({ search: term }),
      listCustomers({ search: term }),
    ]);
    res.json({ projects: projects.slice(0, 10), customers: customers.slice(0, 10) });
  }),
);

export default router;
