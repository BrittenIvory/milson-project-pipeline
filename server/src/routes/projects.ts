import { Router } from 'express';
import { queryOne } from '../db/pool';
import { requireAuth, requireRole } from '../middleware/auth';
import { asyncHandler } from '../middleware/errors';
import { listActivity, logActivity, toActivityDto } from '../services/activityService';
import {
  createProject,
  getProject,
  listProjects,
  projectSchema,
  projectStats,
  updateProject,
} from '../services/projectService';
import documentsRouter from './documents';

const router = Router();
router.use(requireAuth);

/** Roles allowed to create or edit projects (administrators always allowed). */
const canEditProjects = requireRole('engineering', 'sales', 'production');

router.get(
  '/stats',
  asyncHandler(async (_req, res) => {
    res.json(await projectStats());
  }),
);

/**
 * Previews the next project number for the "New Project" form. The value is
 * only reserved when the project is actually created.
 */
router.get(
  '/next-number',
  asyncHandler(async (_req, res) => {
    const row = await queryOne<{ last_value: string; is_called: boolean }>(
      'SELECT last_value, is_called FROM project_number_seq',
    );
    const next = row ? Number(row.last_value) + (row.is_called ? 1 : 0) : 1;
    res.json({ projectNumber: `P-${String(next).padStart(4, '0')}` });
  }),
);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    res.json(
      await listProjects({
        search: typeof req.query.search === 'string' ? req.query.search : undefined,
        stage: typeof req.query.stage === 'string' ? req.query.stage : undefined,
        customerId: req.query.customerId ? Number(req.query.customerId) : undefined,
        includeArchived: req.query.includeArchived === 'true',
      }),
    );
  }),
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    res.json(await getProject(Number(req.params.id)));
  }),
);

/** Activity feed scoped to a single project. */
router.get(
  '/:id/activity',
  asyncHandler(async (req, res) => {
    const records = await listActivity({ entityType: 'project', entityId: Number(req.params.id) });
    res.json(records.map(toActivityDto));
  }),
);

router.post(
  '/',
  canEditProjects,
  asyncHandler(async (req, res) => {
    const project = await createProject(projectSchema.parse(req.body), req.user!.id);
    await logActivity({
      actor: req.user ?? null,
      action: 'Project Created',
      entityType: 'project',
      entityId: project.id,
      detail: `${project.projectNumber} - ${project.projectName}`,
    });
    res.status(201).json(project);
  }),
);

router.put(
  '/:id',
  canEditProjects,
  asyncHandler(async (req, res) => {
    const project = await updateProject(Number(req.params.id), projectSchema.parse(req.body));
    await logActivity({
      actor: req.user ?? null,
      action: 'Project Updated',
      entityType: 'project',
      entityId: project.id,
      detail: `${project.projectNumber} - ${project.projectName}`,
    });
    res.json(project);
  }),
);

router.use('/:projectId/documents', documentsRouter);

export default router;
