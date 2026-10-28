import { Router } from 'express';
import { requireAuth, requirePermission, requireRole } from '../middleware/auth';
import { asyncHandler } from '../middleware/errors';
import {
  createProjectType,
  deleteProjectType,
  listProjectTypes,
  projectTypeSchema,
  updateProjectType,
} from '../services/projectTypeService';

const router = Router();
router.use(requireAuth);

// The type list is only managed from Settings, so reads stay inside
// projects.view scope like the rest of project reference data.
router.get(
  '/',
  requirePermission('projects.view'),
  asyncHandler(async (req, res) => {
    res.json(await listProjectTypes(req.user!.role === 'administrator' && req.query.all === 'true'));
  }),
);

const adminOnly = requireRole();

router.post(
  '/',
  adminOnly,
  asyncHandler(async (req, res) => {
    res.status(201).json(await createProjectType(projectTypeSchema.parse(req.body)));
  }),
);

router.put(
  '/:id',
  adminOnly,
  asyncHandler(async (req, res) => {
    res.json(await updateProjectType(Number(req.params.id), projectTypeSchema.parse(req.body)));
  }),
);

router.delete(
  '/:id',
  adminOnly,
  asyncHandler(async (req, res) => {
    await deleteProjectType(Number(req.params.id));
    res.status(204).end();
  }),
);

export default router;
