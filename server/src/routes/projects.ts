import { Router } from 'express';
import multer from 'multer';
import { config } from '../config';
import { queryOne } from '../db/pool';
import { requireAuth, requireRole } from '../middleware/auth';
import { asyncHandler } from '../middleware/errors';
import { listActivity, logActivity, toActivityDto } from '../services/activityService';
import { notify } from '../services/notificationService';
import { generateQuickQuoteDocument } from '../services/quickQuoteService';
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
import { storage } from '../services/storage';
import documentsRouter from './documents';
import notesRouter from './notes';
import supplierQuotesRouter from './supplierQuotes';
import tasksRouter from './tasks';

const router = Router();
router.use(requireAuth);
const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: Math.min(config.maxUploadBytes, 10 * 1024 * 1024) },
});

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

router.get(
  '/:id/part-image',
  asyncHandler(async (req, res) => {
    const project = await getProject(Number(req.params.id));
    if (!project.partImageStorageKey || !project.partImageMimeType) {
      res.status(404).json({ error: 'No part image uploaded' });
      return;
    }
    if (!(await storage.exists(project.partImageStorageKey))) {
      res.status(410).json({ error: 'Stored part image is no longer available' });
      return;
    }
    res.setHeader('Content-Type', project.partImageMimeType);
    res.setHeader('Content-Disposition', 'inline');
    storage.createReadStream(project.partImageStorageKey).pipe(res);
  }),
);

router.post(
  '/:id/part-image',
  canEditProjects,
  imageUpload.single('file'),
  asyncHandler(async (req, res) => {
    const projectId = Number(req.params.id);
    const project = await getProject(projectId);
    if (!req.file || !req.file.mimetype.startsWith('image/')) {
      res.status(400).json({ error: 'Upload a PNG, JPEG, or other image file' });
      return;
    }
    const key = await storage.save(projectId, req.file.originalname, req.file.buffer);
    const previousKey = project.partImageStorageKey;
    const updated = await queryOne<{ id: number }>(
      `UPDATE projects
       SET part_image_storage_key=$2, part_image_file_name=$3, part_image_mime_type=$4,
           part_image_size_bytes=$5, updated_at=NOW()
       WHERE id=$1
       RETURNING id`,
      [projectId, key, req.file.originalname, req.file.mimetype, req.file.size],
    );
    if (!updated) {
      await storage.remove(key).catch(() => undefined);
      res.status(404).json({ error: 'Project not found' });
      return;
    }
    await logActivity({
      actor: req.user ?? null,
      action: 'Part Image Uploaded',
      entityType: 'project',
      entityId: projectId,
      detail: `${project.projectNumber} - ${req.file.originalname}`,
    });
    const refreshedProject = await getProject(projectId);
    await generateQuickQuoteDocument(refreshedProject, req.user!.id);
    if (previousKey && previousKey !== key) {
      await storage.remove(previousKey).catch(() => undefined);
    }
    res.json(refreshedProject);
  }),
);

router.delete(
  '/:id/part-image',
  canEditProjects,
  asyncHandler(async (req, res) => {
    const projectId = Number(req.params.id);
    const existing = await queryOne<{ part_image_storage_key: string | null }>(
      'SELECT part_image_storage_key FROM projects WHERE id = $1',
      [projectId],
    );
    if (!existing) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }
    await queryOne(
      `UPDATE projects SET part_image_storage_key=NULL, part_image_file_name=NULL,
       part_image_mime_type=NULL, part_image_size_bytes=NULL, updated_at=NOW() WHERE id=$1 RETURNING id`,
      [projectId],
    );
    if (existing.part_image_storage_key) await storage.remove(existing.part_image_storage_key).catch(() => undefined);
    await logActivity({
      actor: req.user ?? null,
      action: 'Part Image Deleted',
      entityType: 'project',
      entityId: projectId,
      detail: 'Project part image',
    });
    const refreshedProject = await getProject(projectId);
    await generateQuickQuoteDocument(refreshedProject, req.user!.id);
    res.status(204).end();
  }),
);

router.post(
  '/:id/quick-quote',
  canEditProjects,
  asyncHandler(async (req, res) => {
    const projectId = Number(req.params.id);
    const project = await getProject(projectId);
    const document = await generateQuickQuoteDocument(project, req.user!.id);
    if (!document) {
      res.status(422).json({
        error: 'Add a material, estimated weight, and supported casting process before generating an estimate.',
      });
      return;
    }
    await logActivity({
      actor: req.user ?? null,
      action: 'Estimate Quote Generated',
      entityType: 'project',
      entityId: project.id,
      detail: `${project.projectNumber} - ${document.fileName}`,
    });
    res.json(document);
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
    try {
      const document = await generateQuickQuoteDocument(project, req.user!.id);
      if (document) {
        await logActivity({
          actor: req.user ?? null,
          action: 'Estimate Quote Generated',
          entityType: 'project',
          entityId: project.id,
          detail: `${project.projectNumber} - ${document.fileName}`,
        });
      }
    } catch (err) {
      console.error('Unable to generate project estimate quote', err);
    }
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
    try {
      const document = await generateQuickQuoteDocument(project, req.user!.id);
      if (document) {
        await logActivity({
          actor: req.user ?? null,
          action: 'Estimate Quote Generated',
          entityType: 'project',
          entityId: project.id,
          detail: `${project.projectNumber} - ${document.fileName}`,
        });
      }
    } catch (err) {
      console.error('Unable to refresh project estimate quote', err);
    }
    res.json(project);
  }),
);

router.use('/:projectId/documents', documentsRouter);
router.use('/:projectId/tasks', tasksRouter);
router.use('/:projectId/notes', notesRouter);
router.use('/:projectId/supplier-quotes', supplierQuotesRouter);

export default router;
