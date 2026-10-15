import { NextFunction, Request, Response } from 'express';

interface RateLimitOptions {
  /** Length of the fixed window in milliseconds. */
  windowMs: number;
  /** Requests allowed per key within one window. */
  max: number;
  /** Builds the bucket key for a request. */
  key: (req: Request) => string;
}

interface Bucket {
  count: number;
  resetAt: number;
}

/**
 * Small in-memory fixed-window rate limiter. Exported factory so tests can
 * drive it with fake requests; intended for low-traffic endpoints like login.
 */
export function createRateLimiter({ windowMs, max, key }: RateLimitOptions) {
  const buckets = new Map<string, Bucket>();

  function middleware(req: Request, res: Response, next: NextFunction): void {
    const now = Date.now();
    const bucketKey = key(req);
    let bucket = buckets.get(bucketKey);
    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + windowMs };
      buckets.set(bucketKey, bucket);
    }
    bucket.count += 1;
    if (bucket.count > max) {
      res.setHeader('Retry-After', Math.ceil((bucket.resetAt - now) / 1000));
      res.status(429).json({ error: 'Too many attempts. Please try again later.' });
      return;
    }
    next();
  }

  /** Test hook: clears every bucket. */
  middleware.reset = () => buckets.clear();

  return middleware;
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * CSRF protection for the cookie-authenticated session: any mutating request
 * that presents an Origin/Referer must originate from this same host. Requests
 * without an Origin (curl, scripts, mobile clients) can only authenticate with
 * a Bearer token — the session cookie is SameSite=Lax and cannot ride a
 * cross-site form POST anyway, so they are safe to pass through.
 */
export function csrfOriginCheck(req: Request, res: Response, next: NextFunction): void {
  if (SAFE_METHODS.has(req.method)) {
    next();
    return;
  }
  const source = req.headers.origin ?? req.headers.referer;
  if (!source) {
    next();
    return;
  }
  try {
    const host = new URL(source).host;
    if (host !== req.headers.host) {
      res.status(403).json({ error: 'Blocked cross-site request' });
      return;
    }
  } catch {
    res.status(403).json({ error: 'Blocked cross-site request' });
    return;
  }
  next();
}
