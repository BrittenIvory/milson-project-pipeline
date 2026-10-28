import { Router } from 'express';
import { requireAuth, requirePermission, requireRole } from '../middleware/auth';
import { asyncHandler } from '../middleware/errors';
import {
  createProjectType,
  deleteProjectType,
  getTypeTemplate,
  listProjectTypes,
  projectTypeSchema,
  saveTemplate,
  templateSchema,
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

// The editable stage/task template for one type. Reads are open to anyone who
// can view projects (the create form needs it for the stage picker); saves are
// admin-only and bump the template version.
router.get(
  '/:id/template',
  requirePermission('projects.view'),
  asyncHandler(async (req, res) => {
    res.json(await getTypeTemplate(Number(req.params.id)));
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

router.put(
  '/:id/template',
  adminOnly,
  asyncHandler(async (req, res) => {
    const { stages } = templateSchema.parse(req.body);
    res.json(await saveTemplate(Number(req.params.id), stages));
  }),
);

export default router;
