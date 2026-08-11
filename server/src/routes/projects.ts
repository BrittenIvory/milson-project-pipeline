import { Router } from 'express';
import { queryOne } from '../db/pool';
import { requireAuth, requireRole } from '../middleware/auth';
import { asyncHandler } from '../middleware/errors';
import { listActivity, logActivity, toActivityDto } from '../services/activityService';
import { notify } from '../services/notificationService';
import { stageLabel } from '../types';
import {
  createProject,
  dashboardSummary,
  getProject,
  listProjects,
  listProjectsPage,
  projectFilterOptions,
  projectSchema,
  projectStats,
  updateProject,
} from '../services/projectService';
import { seedStageTasks } from '../services/workflowService';
import documentsRouter from './documents';
import notesRouter from './notes';
import supplierQuotesRouter from './supplierQuotes';
import tasksRouter from './tasks';

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

/** Everything the dashboard renders, in one request. */
router.get(
  '/dashboard',
  asyncHandler(async (_req, res) => {
    res.json(await dashboardSummary());
  }),
);

/** Distinct materials / casting processes for the filter menus. */
router.get(
  '/filter-options',
  asyncHandler(async (_req, res) => {
    res.json(await projectFilterOptions());
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

/** Reads a string query parameter, ignoring arrays and empty values. */
const str = (value: unknown): string | undefined =>
  typeof value === 'string' && value !== '' ? value : undefined;
const num = (value: unknown): number | undefined =>
  typeof value === 'string' && value !== '' ? Number(value) : undefined;

/**
 * Project list. Returns a plain array by default and a `{ items, total }`
 * page when `paginate=true`, so existing callers keep working.
 */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const filters = {
      search: str(req.query.search),
      stage: str(req.query.stage),
      customerId: num(req.query.customerId),
      engineerId: num(req.query.engineerId),
      salesId: num(req.query.salesId),
      priority: str(req.query.priority),
      material: str(req.query.material),
      castingProcess: str(req.query.castingProcess),
      createdFrom: str(req.query.createdFrom),
      createdTo: str(req.query.createdTo),
      updatedFrom: str(req.query.updatedFrom),
      updatedTo: str(req.query.updatedTo),
      targetFrom: str(req.query.targetFrom),
      targetTo: str(req.query.targetTo),
      includeArchived: req.query.includeArchived === 'true',
    };
    if (req.query.paginate === 'true') {
      res.json(
        await listProjectsPage({
          ...filters,
          sortBy: str(req.query.sortBy),
          sortDir: str(req.query.sortDir),
          page: num(req.query.page),
          pageSize: num(req.query.pageSize),
        }),
      );
      return;
    }
    res.json(await listProjects(filters));
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
    const before = await getProject(Number(req.params.id));
    const project = await updateProject(Number(req.params.id), projectSchema.parse(req.body));
    const stageChanged = before.currentStage !== project.currentStage;
    if (stageChanged) await seedStageTasks(project.id, project.currentStage);
    await logActivity({
      actor: req.user ?? null,
      action: stageChanged ? 'Stage Updated' : 'Project Updated',
      entityType: 'project',
      entityId: project.id,
      detail: stageChanged
        ? `${project.projectNumber}: ${stageLabel(before.currentStage)} → ${stageLabel(project.currentStage)}`
        : `${project.projectNumber} - ${project.projectName}`,
    });

    // Keep the assigned engineer and salesperson aware of changes.
    const watchers = new Set(
      [project.assignedEngineerId, project.assignedSalesId].filter(
        (id): id is number => typeof id === 'number',
      ),
    );
    for (const userId of watchers) {
      await notify({
        userId,
        actorId: req.user?.id,
        type: stageChanged ? 'stage_updated' : 'project_updated',
        title: stageChanged ? 'Project stage updated' : 'Project updated',
        body: `${project.projectNumber} — ${project.projectName}`,
        projectId: project.id,
        entityType: 'project',
        entityId: project.id,
      });
    }
    res.json(project);
  }),
);

router.use('/:projectId/documents', documentsRouter);
router.use('/:projectId/tasks', tasksRouter);
router.use('/:projectId/notes', notesRouter);
router.use('/:projectId/supplier-quotes', supplierQuotesRouter);

export default router;
