import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { NextFunction, Request, Response } from 'express';
import { createRateLimiter, csrfOriginCheck } from './security';

interface FakeResponse {
  statusCode: number;
  body: unknown;
  headers: Record<string, string>;
}

function fakeReq(partial: Partial<Request>): Request {
  return partial as Request;
}

function fakeRes(): { res: Response; state: FakeResponse } {
  const state: FakeResponse = { statusCode: 200, body: undefined, headers: {} };
  const res = {
    status(code: number) {
      state.statusCode = code;
      return res;
    },
    json(body: unknown) {
      state.body = body;
      return res;
    },
    setHeader(name: string, value: string | number) {
      state.headers[name] = String(value);
      return res;
    },
  } as unknown as Response;
  return { res, state };
}

function run(mw: (req: Request, res: Response, next: NextFunction) => void, req: Request) {
  const { res, state } = fakeRes();
  let called = false;
  mw(req, res, () => {
    called = true;
  });
  return { passed: called, state };
}

describe('createRateLimiter', () => {
  const limiter = createRateLimiter({
    windowMs: 60_000,
    max: 3,
    key: (req) => `${req.ip}|${String((req.body as { email?: string })?.email ?? '')}`,
  });

  it('allows requests up to the limit, then rejects with 429', () => {
    const req = () => fakeReq({ ip: '1.1.1.1', body: { email: 'a@b.co' } as Request['body'] });
    assert.equal(run(limiter, req()).passed, true);
    assert.equal(run(limiter, req()).passed, true);
    assert.equal(run(limiter, req()).passed, true);
    const blocked = run(limiter, req());
    assert.equal(blocked.passed, false);
    assert.equal(blocked.state.statusCode, 429);
    assert.ok(blocked.state.headers['Retry-After']);
  });

  it('tracks buckets independently per key', () => {
    const req = (ip: string) => fakeReq({ ip, body: { email: 'x@y.co' } as Request['body'] });
    assert.equal(run(limiter, req('9.9.9.9')).passed, true);
    assert.equal(run(limiter, req('9.9.9.9')).passed, true);
    assert.equal(run(limiter, req('9.9.9.9')).passed, true);
    assert.equal(run(limiter, req('8.8.8.8')).passed, true);
  });
});

describe('csrfOriginCheck', () => {
  const mutation = (origin?: string, host = 'app.example.com') =>
    fakeReq({
      method: 'POST',
      headers: { host, ...(origin ? { origin } : {}) },
    } as Request);

  it('passes safe methods regardless of origin', () => {
    const { passed } = run(
      csrfOriginCheck,
      fakeReq({ method: 'GET', headers: { host: 'app.example.com', origin: 'https://evil.com' } } as Request),
    );
    assert.equal(passed, true);
  });

  it('passes same-origin mutations', () => {
    const { passed } = run(csrfOriginCheck, mutation('https://app.example.com'));
    assert.equal(passed, true);
  });

  it('rejects cross-origin mutations with 403', () => {
    const { passed, state } = run(csrfOriginCheck, mutation('https://evil.com'));
    assert.equal(passed, false);
    assert.equal(state.statusCode, 403);
  });

  it('rejects a malformed origin', () => {
    const { passed, state } = run(csrfOriginCheck, mutation('not-a-url'));
    assert.equal(passed, false);
    assert.equal(state.statusCode, 403);
  });

  it('passes mutations without an origin (non-browser clients)', () => {
    const { passed } = run(csrfOriginCheck, mutation());
    assert.equal(passed, true);
  });
});
