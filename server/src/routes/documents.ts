import { Router } from 'express';
import multer from 'multer';
import { config } from '../config';
import { query, queryOne } from '../db/pool';
import { requireRole } from '../middleware/auth';
import { asyncHandler, HttpError } from '../middleware/errors';
import { logActivity } from '../services/activityService';
import { getProject } from '../services/projectService';
import { ALLOWED_EXTENSIONS, extensionOf, storage } from '../services/storage';

interface DocumentRow {
  id: number;
  project_id: number;
  file_name: string;
  storage_key: string;
  storage_driver: string;
  mime_type: string | null;
  extension: string | null;
  size_bytes: string;
  uploaded_by: number | null;
  created_at: string;
  uploaded_by_name?: string | null;
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.maxUploadBytes },
});

// Mounted under /api/projects/:projectId/documents.
const router = Router({ mergeParams: true });

const canManageDocuments = requireRole('engineering', 'sales', 'production', 'quality');

function toDocumentDto(row: DocumentRow) {
  return {
    id: row.id,
    projectId: row.project_id,
    fileName: row.file_name,
    extension: row.extension,
    mimeType: row.mime_type,
    sizeBytes: Number(row.size_bytes),
    uploadedById: row.uploaded_by,
    uploadedByName: row.uploaded_by_name ?? null,
    createdAt: row.created_at,
  };
}

function projectIdOf(params: Record<string, string>): number {
  const id = Number(params.projectId);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, 'Invalid project id');
  return id;
}

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const projectId = projectIdOf(req.params as Record<string, string>);
    const rows = await query<DocumentRow>(
      `SELECT d.*, u.full_name AS uploaded_by_name
       FROM documents d LEFT JOIN users u ON u.id = d.uploaded_by
       WHERE d.project_id = $1 ORDER BY d.created_at DESC`,
      [projectId],
    );
    res.json(rows.map(toDocumentDto));
  }),
);

router.post(
  '/',
  canManageDocuments,
  upload.single('file'),
  asyncHandler(async (req, res) => {
    const projectId = projectIdOf(req.params as Record<string, string>);
    const project = await getProject(projectId);
    if (!req.file) throw new HttpError(400, 'No file was uploaded');

    const extension = extensionOf(req.file.originalname);
    if (!ALLOWED_EXTENSIONS.includes(extension)) {
      throw new HttpError(400, `Unsupported file type: .${extension}`);
    }

    const key = await storage.save(projectId, req.file.originalname, req.file.buffer);
    const row = await queryOne<DocumentRow>(
      `INSERT INTO documents (project_id, file_name, storage_key, storage_driver, mime_type,
         extension, size_bytes, uploaded_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [
        projectId, req.file.originalname, key, storage.driver, req.file.mimetype,
        extension, req.file.size, req.user?.id ?? null,
      ],
    );
    await logActivity({
      actor: req.user ?? null,
      action: 'Document Uploaded',
      entityType: 'project',
      entityId: projectId,
      detail: `${req.file.originalname} (${project.projectNumber})`,
    });
    res.status(201).json(toDocumentDto(row as DocumentRow));
  }),
);

router.get(
  '/:documentId/download',
  asyncHandler(async (req, res) => {
    const projectId = projectIdOf(req.params as Record<string, string>);
    const row = await queryOne<DocumentRow>(
      'SELECT * FROM documents WHERE id = $1 AND project_id = $2',
      [Number(req.params.documentId), projectId],
    );
    if (!row) throw new HttpError(404, 'Document not found');
    if (!(await storage.exists(row.storage_key))) {
      throw new HttpError(410, 'Stored file is no longer available');
    }
    res.setHeader('Content-Type', row.mime_type ?? 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(row.file_name)}"`);
    storage.createReadStream(row.storage_key).pipe(res);
  }),
);

router.delete(
  '/:documentId',
  canManageDocuments,
  asyncHandler(async (req, res) => {
    const projectId = projectIdOf(req.params as Record<string, string>);
    const row = await queryOne<DocumentRow>(
      'DELETE FROM documents WHERE id = $1 AND project_id = $2 RETURNING *',
      [Number(req.params.documentId), projectId],
    );
    if (!row) throw new HttpError(404, 'Document not found');
    await storage.remove(row.storage_key);
    await logActivity({
      actor: req.user ?? null,
      action: 'Document Deleted',
      entityType: 'project',
      entityId: projectId,
      detail: row.file_name,
    });
    res.status(204).end();
  }),
);

export default router;
