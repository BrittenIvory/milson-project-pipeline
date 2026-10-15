import bcrypt from 'bcryptjs';
import { Router } from 'express';
import { z } from 'zod';
import { config } from '../config';
import { pool, queryOne } from '../db/pool';
import { requireAuth, SESSION_COOKIE, sessionMaxAgeMs, signToken } from '../middleware/auth';
import { asyncHandler, HttpError } from '../middleware/errors';
import { createRateLimiter } from '../middleware/security';
import { logActivity } from '../services/activityService';
import type { Role } from '../types';

const router = Router();

const credentialsSchema = z.object({
  email: z.string().trim().min(1, 'Email is required'),
  password: z.string().min(1, 'Password is required'),
});

const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(200, 'Password is too long');

/** At most 10 login attempts per email+IP per 15 minutes. */
const loginLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 10,
  key: (req) => `${req.ip ?? 'unknown'}|${String(req.body?.email ?? '').toLowerCase()}`,
});

function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: config.nodeEnv === 'production',
    path: '/',
    maxAge: sessionMaxAgeMs(),
  };
}

/** Exchanges credentials for an httpOnly session cookie. */
router.post(
  '/login',
  loginLimiter,
  asyncHandler(async (req, res) => {
    const { email, password } = credentialsSchema.parse(req.body);
    const user = await queryOne<{
      id: number;
      email: string;
      full_name: string;
      role: Role;
      password_hash: string;
      is_active: boolean;
      must_change_password: boolean;
    }>('SELECT * FROM users WHERE LOWER(email) = LOWER($1)', [email]);

    if (!user || !user.is_active || !(await bcrypt.compare(password, user.password_hash))) {
      throw new HttpError(401, 'Invalid email or password');
    }

    const profile = {
      id: user.id,
      email: user.email,
      fullName: user.full_name,
      role: user.role,
      mustChangePassword: user.must_change_password,
    };
    res.cookie(SESSION_COOKIE, signToken(user.id), sessionCookieOptions());
    await logActivity({ actor: profile, action: 'User Logged In', entityType: 'user', entityId: user.id });
    res.json({ user: profile });
  }),
);

/** Clears the session cookie. */
router.post('/logout', (_req, res) => {
  res.clearCookie(SESSION_COOKIE, { ...sessionCookieOptions(), maxAge: undefined });
  res.json({ ok: true });
});

/** Returns the currently authenticated user. */
router.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

/** Lets a signed-in user replace their password (also clears the reset flag). */
router.post(
  '/change-password',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { currentPassword, newPassword } = z
      .object({ currentPassword: z.string().min(1, 'Current password is required'), newPassword: passwordSchema })
      .parse(req.body);

    const row = await queryOne<{ password_hash: string }>(
      'SELECT password_hash FROM users WHERE id = $1',
      [req.user!.id],
    );
    if (!row || !(await bcrypt.compare(currentPassword, row.password_hash))) {
      throw new HttpError(400, 'Current password is incorrect');
    }

    const hash = await bcrypt.hash(newPassword, 12);
    await pool.query(
      `UPDATE users SET password_hash = $1, must_change_password = FALSE,
       password_changed_at = NOW(), updated_at = NOW() WHERE id = $2`,
      [hash, req.user!.id],
    );
    await logActivity({
      actor: req.user!,
      action: 'Password Changed',
      entityType: 'user',
      entityId: req.user!.id,
    });
    res.json({ ok: true });
  }),
);

export default router;
