import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { queryOne } from '../db/pool';
import type { AuthUser, Role } from '../types';

declare module 'express-serve-static-core' {
  interface Request {
    /** Set by `requireAuth` for every protected route. */
    user?: AuthUser;
  }
}

interface TokenPayload {
  sub: number;
}

/** Signs a short-lived access token for a user id. */
export function signToken(userId: number): string {
  return jwt.sign({ sub: userId } satisfies TokenPayload, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn,
  } as jwt.SignOptions);
}

/**
 * Verifies the bearer token, loads the (still active) user and attaches it to
 * the request. Rejects with 401 when the token is missing or invalid.
 */
export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const header = req.headers.authorization ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  try {
    const payload = jwt.verify(token, config.jwtSecret) as unknown as TokenPayload;
    const user = await queryOne<{ id: number; email: string; full_name: string; role: Role }>(
      'SELECT id, email, full_name, role FROM users WHERE id = $1 AND is_active = TRUE',
      [payload.sub],
    );
    if (!user) {
      res.status(401).json({ error: 'Account is no longer active' });
      return;
    }
    req.user = { id: user.id, email: user.email, fullName: user.full_name, role: user.role };
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired session' });
  }
}

/** Restricts a route to the given roles. Administrators always pass. */
export function requireRole(...roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const role = req.user?.role;
    if (!role) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }
    if (role !== 'administrator' && !roles.includes(role)) {
      res.status(403).json({ error: 'You do not have permission to perform this action' });
      return;
    }
    next();
  };
}
