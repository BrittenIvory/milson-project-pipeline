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
  /** Hard cap on tracked keys so arbitrary emails/IPs cannot exhaust memory. */
  const MAX_BUCKETS = 10_000;

  function middleware(req: Request, res: Response, next: NextFunction): void {
    const now = Date.now();
    const bucketKey = key(req);
    let bucket = buckets.get(bucketKey);
    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + windowMs };
      buckets.set(bucketKey, bucket);
    }
    if (buckets.size > MAX_BUCKETS) {
      // Drop expired buckets first, then the oldest ones if still over the cap.
      for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k);
      while (buckets.size > MAX_BUCKETS) buckets.delete(buckets.keys().next().value!);
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
 * that presents an Origin/Referer must originate from this same host. Mutating
 * requests with no Origin/Referer at all must authenticate with a Bearer token —
 * a cookie-authenticated mutation that cannot prove its origin is rejected.
 */
export function csrfOriginCheck(req: Request, res: Response, next: NextFunction): void {
  if (SAFE_METHODS.has(req.method)) {
    next();
    return;
  }
  const source = req.headers.origin ?? req.headers.referer;
  if (!source) {
    // Non-browser clients (curl, scripts) authenticate with a Bearer token and
    // carry no Origin — let them through; login is exempt so they can obtain
    // their first session. A mutation that would authenticate via the session
    // cookie without an Origin/Referer is rejected, since the browser cannot
    // prove which origin initiated it.
    if ((req.headers.authorization ?? '').startsWith('Bearer ') || /^\/auth\/login\/?$/i.test(req.path)) {
      next();
      return;
    }
    res.status(403).json({ error: 'Blocked cross-site request' });
    return;
  }
  try {
    // Compare hostnames only: in development the Vite proxy forwards requests
    // with Origin :5174 and Host :3002, and a port mismatch would wrongly 403.
    const hostname = new URL(source).hostname.toLowerCase();
    const reqHostname = (req.headers.host ?? '').split(':')[0].toLowerCase();
    if (hostname !== reqHostname) {
      res.status(403).json({ error: 'Blocked cross-site request' });
      return;
    }
  } catch {
    res.status(403).json({ error: 'Blocked cross-site request' });
    return;
  }
  next();
}
