import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth';
import { asyncHandler } from '../middleware/errors';
import { createSupplier, listSuppliers, supplierSchema, updateSupplier } from '../services/supplierService';

const router = Router();
router.use(requireAuth);

const canManageSuppliers = requireRole('engineering', 'sales', 'production');

router.get(
  '/',
  asyncHandler(async (req, res) => {
    res.json(await listSuppliers(req.query.includeInactive === 'true'));
  }),
);

router.post(
  '/',
  canManageSuppliers,
  asyncHandler(async (req, res) => {
    res.status(201).json(await createSupplier(supplierSchema.parse(req.body)));
  }),
);

router.put(
  '/:id',
  canManageSuppliers,
  asyncHandler(async (req, res) => {
    res.json(await updateSupplier(Number(req.params.id), supplierSchema.parse(req.body)));
  }),
);

export default router;
