import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import express from 'express';
import { once } from 'node:events';
import { AddressInfo } from 'node:net';
import { missingProductionSecrets } from './config';

const strongEnv = {
  JWT_SECRET: 'x'.repeat(48),
  SEED_ADMIN_EMAIL: 'admin@example.com',
  SEED_ADMIN_PASSWORD: 'correct-horse-battery',
};

describe('missingProductionSecrets', () => {
  it('accepts a fully configured environment', () => {
    assert.deepEqual(missingProductionSecrets(strongEnv), []);
  });

  it('requires a JWT_SECRET that is set and strong', () => {
    assert.deepEqual(missingProductionSecrets({ ...strongEnv, JWT_SECRET: undefined }), [
      'JWT_SECRET (at least 32 characters)',
    ]);
    assert.ok(missingProductionSecrets({ ...strongEnv, JWT_SECRET: 'short' }).length > 0);
    assert.ok(
      missingProductionSecrets({ ...strongEnv, JWT_SECRET: 'dev-only-insecure-secret' }).length > 0,
    );
  });

  it('requires an admin email and a strong admin password', () => {
    assert.ok(missingProductionSecrets({ ...strongEnv, SEED_ADMIN_EMAIL: '' }).length > 0);
    assert.ok(missingProductionSecrets({ ...strongEnv, SEED_ADMIN_PASSWORD: 'Admin123!' }).length > 0);
    assert.ok(missingProductionSecrets({ ...strongEnv, SEED_ADMIN_PASSWORD: 'weak' }).length > 0);
  });
});

describe('trust proxy', () => {
  it('reports the real visitor address behind a single proxy hop', async () => {
    const app = express();
    app.set('trust proxy', 1);
    app.get('/ip', (req, res) => res.json({ ip: req.ip }));
    const server = app.listen(0);
    await once(server, 'listening');
    const { port } = server.address() as AddressInfo;
    try {
      const body = (await fetch(`http://127.0.0.1:${port}/ip`, {
        headers: { 'X-Forwarded-For': '203.0.113.7' },
      }).then((r) => r.json())) as { ip: string };
      assert.equal(body.ip, '203.0.113.7');
    } finally {
      server.close();
    }
  });
});
