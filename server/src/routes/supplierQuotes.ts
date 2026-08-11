import { Router } from 'express';
import { requireRole } from '../middleware/auth';
import { asyncHandler, HttpError } from '../middleware/errors';
import {
  listSupplierQuotes,
  removeSupplierQuote,
  supplierQuoteSchema,
  upsertSupplierQuote,
} from '../services/supplierQuoteService';

const router = Router({ mergeParams: true });
const canManageQuotes = requireRole('engineering', 'sales', 'production');

function projectIdOf(value: string) {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, 'Invalid project id');
  return id;
}

router.get(
  '/',
  asyncHandler(async (req, res) => {
    res.json(await listSupplierQuotes(projectIdOf(req.params.projectId)));
  }),
);

router.put(
  '/:supplierId',
  canManageQuotes,
  asyncHandler(async (req, res) => {
    const projectId = projectIdOf(req.params.projectId);
    const supplierId = Number(req.params.supplierId);
    res.json(
      await upsertSupplierQuote(
        projectId,
        supplierQuoteSchema.parse({ ...req.body, supplierId }),
      ),
    );
  }),
);

router.delete(
  '/:supplierId',
  canManageQuotes,
  asyncHandler(async (req, res) => {
    await removeSupplierQuote(projectIdOf(req.params.projectId), Number(req.params.supplierId));
    res.status(204).end();
  }),
);

export default router;
