import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { Router } from 'express';
import { z } from 'zod';
import { pool, query, queryOne } from '../db/pool';
import { requireAuth, requireRole } from '../middleware/auth';
import { asyncHandler, HttpError } from '../middleware/errors';
import { logActivity } from '../services/activityService';
import { ROLES, type Role } from '../types';

const router = Router();
router.use(requireAuth);

/** Administrators only — Standard roles get 403. */
const adminOnly = requireRole();

/** Serializes administrator role/status changes (pg advisory lock key). */
const ADVISORY_LOCK_USER_MGMT = 72813;

/** Lists active users, used to populate assignment dropdowns. */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const role = typeof req.query.role === 'string' ? req.query.role : undefined;
    const rows = await query<{ id: number; full_name: string; email: string; role: Role }>(
      `SELECT id, full_name, email, role FROM users
       WHERE is_active = TRUE ${role ? 'AND role = $1' : ''}
       ORDER BY full_name`,
      role ? [role] : [],
    );
    res.json(rows.map((r) => ({ id: r.id, fullName: r.full_name, email: r.email, role: r.role })));
  }),
);

interface ManagedUserRow {
  id: number;
  email: string;
  full_name: string;
  role: Role;
  is_active: boolean;
  must_change_password: boolean;
  created_at: Date;
}

function toManagedUser(r: ManagedUserRow) {
  return {
    id: r.id,
    email: r.email,
    fullName: r.full_name,
    role: r.role,
    isActive: r.is_active,
    mustChangePassword: r.must_change_password,
    createdAt: r.created_at,
  };
}

/** Administrator view of every account, including deactivated ones. */
router.get(
  '/manage',
  adminOnly,
  asyncHandler(async (_req, res) => {
    const rows = await query<ManagedUserRow>(
      `SELECT id, email, full_name, role, is_active, must_change_password, created_at
       FROM users ORDER BY full_name`,
    );
    res.json(rows.map(toManagedUser));
  }),
);

const createUserSchema = z.object({
  email: z.string().trim().email('A valid email is required'),
  fullName: z.string().trim().min(1, 'Name is required'),
  role: z.enum(ROLES as [Role, ...Role[]]),
  /** Optional; a temporary password is generated when omitted. */
  password: z.string().min(8, 'Password must be at least 8 characters').optional(),
});

/** Creates an employee account. There is no public registration endpoint. */
router.post(
  '/manage',
  adminOnly,
  asyncHandler(async (req, res) => {
    const { email, fullName, role, password: givenPassword } = createUserSchema.parse(req.body);
    const password = givenPassword ?? crypto.randomBytes(9).toString('base64url');

    const existing = await queryOne('SELECT id FROM users WHERE LOWER(email) = LOWER($1)', [email]);
    if (existing) throw new HttpError(409, 'A user with that email already exists');

    const hash = await bcrypt.hash(password, 12);
    const row = await queryOne<ManagedUserRow>(
      `INSERT INTO users (email, full_name, password_hash, role, must_change_password)
       VALUES ($1, $2, $3, $4, TRUE) RETURNING *`,
      [email, fullName, hash, role],
    );
    await logActivity({
      actor: req.user!,
      action: 'User Created',
      entityType: 'user',
      entityId: row!.id,
      detail: `${email} (${role})`,
    });
    // The temporary password is returned once so the admin can hand it over;
    // the account is flagged must_change_password until the employee sets their own.
    res.status(201).json({ user: toManagedUser(row!), temporaryPassword: password });
  }),
);

const updateUserSchema = z
  .object({
    isActive: z.boolean().optional(),
    role: z.enum(ROLES as [Role, ...Role[]]).optional(),
    fullName: z.string().trim().min(1).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'Nothing to update' });

/** Updates role, name, or active status. Admins cannot deactivate or demote themselves. */
router.patch(
  '/manage/:id',
  adminOnly,
  asyncHandler(async (req, res) => {
    const targetId = Number(req.params.id);
    if (!Number.isInteger(targetId)) throw new HttpError(400, 'Invalid user id');
    const changes = updateUserSchema.parse(req.body);

    if (targetId === req.user!.id && (changes.isActive === false || (changes.role && changes.role !== 'administrator'))) {
      throw new HttpError(400, 'You cannot deactivate or demote your own administrator account');
    }

    // The last-admin check and the update run under a transaction-scoped
    // advisory lock so two admins cannot remove each other concurrently.
    const client = await pool.connect();
    let row: ManagedUserRow | null;
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock($1)', [ADVISORY_LOCK_USER_MGMT]);
      const target = (
        await client.query<{ id: number; role: Role; is_active: boolean }>(
          'SELECT id, role, is_active FROM users WHERE id = $1',
          [targetId],
        )
      ).rows[0];
      if (!target) throw new HttpError(404, 'User not found');

      // Guard against removing the last active administrator.
      const remainsAdmin = (changes.role ?? target.role) === 'administrator';
      const remainsActive = changes.isActive ?? target.is_active;
      if (target.role === 'administrator' && target.is_active && !(remainsAdmin && remainsActive)) {
        const admins = (
          await client.query<{ count: string }>(
            `SELECT COUNT(*) AS count FROM users WHERE role = 'administrator' AND is_active = TRUE`,
          )
        ).rows[0];
        if (Number(admins?.count ?? 0) <= 1) {
          throw new HttpError(400, 'At least one active administrator account is required');
        }
      }

      const sets: string[] = ['updated_at = NOW()'];
      const values: unknown[] = [targetId];
      if (changes.isActive !== undefined) {
        sets.push(`is_active = $${values.length + 1}`);
        values.push(changes.isActive);
      }
      if (changes.role) {
        sets.push(`role = $${values.length + 1}`);
        values.push(changes.role);
      }
      if (changes.fullName) {
        sets.push(`full_name = $${values.length + 1}`);
        values.push(changes.fullName);
      }
      row =
        (
          await client.query<ManagedUserRow>(
            `UPDATE users SET ${sets.join(', ')} WHERE id = $1 RETURNING *`,
            values,
          )
        ).rows[0] ?? null;
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
    await logActivity({
      actor: req.user!,
      action: 'User Updated',
      entityType: 'user',
      entityId: targetId,
      detail: Object.entries(changes)
        .map(([k, v]) => `${k}=${v}`)
        .join(', '),
    });
    res.json({ user: toManagedUser(row!) });
  }),
);

/** Generates a one-time temporary password and forces a change at next login. */
router.post(
  '/manage/:id/reset-password',
  adminOnly,
  asyncHandler(async (req, res) => {
    const targetId = Number(req.params.id);
    if (!Number.isInteger(targetId)) throw new HttpError(400, 'Invalid user id');

    const temporaryPassword = crypto.randomBytes(9).toString('base64url');
    const hash = await bcrypt.hash(temporaryPassword, 12);
    const row = await queryOne<ManagedUserRow>(
      `UPDATE users SET password_hash = $1, must_change_password = TRUE,
       password_changed_at = NOW(), updated_at = NOW()
       WHERE id = $2 RETURNING *`,
      [hash, targetId],
    );
    if (!row) throw new HttpError(404, 'User not found');
    await logActivity({
      actor: req.user!,
      action: 'Password Reset Initiated',
      entityType: 'user',
      entityId: targetId,
    });
    // Shown to the admin once; the user must set a new password at next login.
    res.json({ user: toManagedUser(row), temporaryPassword });
  }),
);

export default router;
