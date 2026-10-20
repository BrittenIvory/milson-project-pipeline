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
  /** Issued-at, seconds since epoch — set automatically by jwt.sign. */
  iat?: number;
}

/** Name of the httpOnly session cookie that carries the JWT. */
export const SESSION_COOKIE = 'milson_session';

/** Signs a short-lived access token for a user id. */
export function signToken(userId: number): string {
  // jsonwebtoken reads a bare numeric string as milliseconds; pass it as a
  // number so it means seconds — the same unit sessionMaxAgeMs assigns it.
  const trimmed = config.jwtExpiresIn.trim();
  const expiresIn = /^\d+$/.test(trimmed) ? Number(trimmed) : trimmed;
  return jwt.sign({ sub: userId } satisfies TokenPayload, config.jwtSecret, {
    expiresIn,
  } as jwt.SignOptions);
}

/** Parses `JWT_EXPIRES_IN` (e.g. '30m', '12h', '7d') into milliseconds. */
export function sessionMaxAgeMs(): number {
  const trimmed = config.jwtExpiresIn.trim();
  const bare = /^(\d+)$/.exec(trimmed);
  if (bare) return Number(bare[1]) * 1_000;
  const match = /^(\d+)\s*(s|m|h|d|w)$/.exec(trimmed);
  if (!match) return 12 * 60 * 60 * 1000;
  const unit = { s: 1_000, m: 60_000, h: 3_600_000, d: 86_400_000, w: 604_800_000 }[
    match[2] as 's' | 'm' | 'h' | 'd' | 'w'
  ];
  return Number(match[1]) * unit;
}

/** Minimal cookie-parser replacement for reading the session cookie. */
function cookieValue(header: string | undefined, name: string): string | null {
  if (!header) return null;
  for (const pair of header.split(';')) {
    const [key, ...rest] = pair.trim().split('=');
    if (key === name) return decodeURIComponent(rest.join('='));
  }
  return null;
}

/** Reads the session token from the Authorization header or the session cookie. */
function extractToken(req: Request): string | null {
  const header = req.headers.authorization ?? '';
  if (header.startsWith('Bearer ')) return header.slice(7);
  return cookieValue(req.headers.cookie, SESSION_COOKIE);
}

/**
 * Verifies the bearer token, loads the (still active) user and attaches it to
 * the request. Rejects with 401 when the token is missing or invalid.
 */
export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const token = extractToken(req);
  if (!token) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  try {
    const payload = jwt.verify(token, config.jwtSecret) as unknown as TokenPayload;
    const user = await queryOne<{
      id: number;
      email: string;
      full_name: string;
      role: Role;
      must_change_password: boolean;
      password_changed_at: Date | null;
    }>(
      'SELECT id, email, full_name, role, must_change_password, password_changed_at FROM users WHERE id = $1 AND is_active = TRUE',
      [payload.sub],
    );
    if (!user) {
      res.status(401).json({ error: 'Account is no longer active' });
      return;
    }
    // Tokens issued before a password change/reset no longer authenticate.
    if (
      user.password_changed_at &&
      (payload.iat ?? 0) * 1000 <= user.password_changed_at.getTime()
    ) {
      res.status(401).json({ error: 'Session was invalidated. Please sign in again.' });
      return;
    }
    // Accounts flagged for a password change may only reach the auth endpoints.
    // baseUrl+path excludes query strings; a trailing slash still matches.
    if (
      user.must_change_password &&
      !(req.baseUrl === '/api/auth' && /^\/(me|logout|change-password)\/?$/.test(req.path))
    ) {
      res.status(403).json({ error: 'Password change required', mustChangePassword: true });
      return;
    }
    req.user = {
      id: user.id,
      email: user.email,
      fullName: user.full_name,
      role: user.role,
      mustChangePassword: user.must_change_password,
    };
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
