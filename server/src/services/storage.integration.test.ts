import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { storageFor } from './storage';

/**
 * Real-S3 integration test. Runs only when the AWS environment is configured
 * (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION, AWS_S3_BUCKET); it is
 * skipped otherwise so unit runs never need credentials. It performs a real
 * PutObject → HeadObject → GetObject → DeleteObject round trip against the
 * configured private bucket, writing one small object under `project-0/`.
 * If the IAM policy lacks s3:DeleteObject the object may be left behind —
 * delete `project-0/` manually or via a lifecycle rule.
 */
const awsConfigured = Boolean(
  process.env.AWS_ACCESS_KEY_ID &&
    process.env.AWS_SECRET_ACCESS_KEY &&
    process.env.AWS_REGION &&
    process.env.AWS_S3_BUCKET,
);

describe('S3 integration (requires AWS env vars)', { skip: !awsConfigured }, () => {
  it('uploads, reads, and deletes a real object in the configured bucket', async () => {
    const s3 = storageFor('s3');
    const payload = Buffer.from(`s3-integration-${Date.now()}`);

    const key = await s3.save(0, 'integration-check.txt', payload, 'text/plain');
    assert.match(key, /^project-0\/\d+-[0-9a-f]{12}\.txt$/);

    assert.equal(await s3.exists(key), true, 'object should exist in S3 after upload');
    assert.deepEqual(await s3.read(key), payload, 'downloaded bytes should match upload');

    await s3.remove(key); // no-ops under a policy without s3:DeleteObject
  });
});
