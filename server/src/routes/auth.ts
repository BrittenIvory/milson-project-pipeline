import bcrypt from 'bcryptjs';
import { Router } from 'express';
import { z } from 'zod';
import { queryOne } from '../db/pool';
import { requireAuth, signToken } from '../middleware/auth';
import { asyncHandler, HttpError } from '../middleware/errors';
import { logActivity } from '../services/activityService';
import type { Role } from '../types';

const router = Router();

const credentialsSchema = z.object({
  email: z.string().trim().min(1, 'Email is required'),
  password: z.string().min(1, 'Password is required'),
});

/** Exchanges credentials for a JWT access token. */
router.post(
  '/login',
  asyncHandler(async (req, res) => {
    const { email, password } = credentialsSchema.parse(req.body);
    const user = await queryOne<{
      id: number;
      email: string;
      full_name: string;
      role: Role;
      password_hash: string;
      is_active: boolean;
    }>('SELECT * FROM users WHERE LOWER(email) = LOWER($1)', [email]);

    if (!user || !user.is_active || !(await bcrypt.compare(password, user.password_hash))) {
      throw new HttpError(401, 'Invalid email or password');
    }

    const profile = { id: user.id, email: user.email, fullName: user.full_name, role: user.role };
    await logActivity({ actor: profile, action: 'User Logged In', entityType: 'user', entityId: user.id });
    res.json({ token: signToken(user.id), user: profile });
  }),
);

/** Returns the currently authenticated user. */
router.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

export default router;
