import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth';
import { asyncHandler } from '../middleware/errors';
import { logActivity } from '../services/activityService';
import {
  archiveCustomer,
  createCustomer,
  customerSchema,
  getCustomer,
  listCustomers,
  restoreCustomer,
  updateCustomer,
} from '../services/customerService';

const router = Router();
router.use(requireAuth);

/** Roles allowed to mutate customer records (administrators always allowed). */
const canEditCustomers = requireRole('sales', 'engineering');

router.get(
  '/',
  asyncHandler(async (req, res) => {
    res.json(
      await listCustomers({
        search: typeof req.query.search === 'string' ? req.query.search : undefined,
        status: typeof req.query.status === 'string' ? req.query.status : undefined,
      }),
    );
  }),
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    res.json(await getCustomer(Number(req.params.id)));
  }),
);

router.post(
  '/',
  canEditCustomers,
  asyncHandler(async (req, res) => {
    const customer = await createCustomer(customerSchema.parse(req.body));
    await logActivity({
      actor: req.user ?? null,
      action: 'Customer Created',
      entityType: 'customer',
      entityId: customer.id,
      detail: customer.companyName,
    });
    res.status(201).json(customer);
  }),
);

router.put(
  '/:id',
  canEditCustomers,
  asyncHandler(async (req, res) => {
    const customer = await updateCustomer(Number(req.params.id), customerSchema.parse(req.body));
    await logActivity({
      actor: req.user ?? null,
      action: 'Customer Updated',
      entityType: 'customer',
      entityId: customer.id,
      detail: customer.companyName,
    });
    res.json(customer);
  }),
);

router.post(
  '/:id/archive',
  canEditCustomers,
  asyncHandler(async (req, res) => {
    const customer = await archiveCustomer(Number(req.params.id));
    await logActivity({
      actor: req.user ?? null,
      action: 'Customer Archived',
      entityType: 'customer',
      entityId: customer.id,
      detail: customer.companyName,
    });
    res.json(customer);
  }),
);

router.post(
  '/:id/restore',
  canEditCustomers,
  asyncHandler(async (req, res) => {
    const customer = await restoreCustomer(Number(req.params.id));
    await logActivity({
      actor: req.user ?? null,
      action: 'Customer Restored',
      entityType: 'customer',
      entityId: customer.id,
      detail: customer.companyName,
    });
    res.json(customer);
  }),
);

export default router;
