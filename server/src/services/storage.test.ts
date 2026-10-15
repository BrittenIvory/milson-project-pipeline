import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Readable } from 'node:stream';
import { S3DocumentStorage, storageFor } from './storage';

interface FakeCommand {
  input: Record<string, unknown>;
  constructor: { name: string };
}

function fakeS3(handler: (command: FakeCommand) => Promise<unknown> | unknown) {
  const sent: FakeCommand[] = [];
  const client = {
    async send(command: unknown): Promise<unknown> {
      const cmd = command as FakeCommand;
      sent.push(cmd);
      return handler(cmd);
    },
  };
  return { sent, client };
}

const err = (name: string) => Object.assign(new Error(name), { name });

describe('S3DocumentStorage', () => {
  it('uploads objects to the private bucket with SSE-S3 encryption', async () => {
    const { sent, client } = fakeS3(() => ({}));
    const s3 = new S3DocumentStorage('milson-docs', client);

    const key = await s3.save(42, 'Bracket.STEP', Buffer.from('solid'), 'application/octet-stream');

    assert.match(key, /^project-42\/\d+-[0-9a-f]{12}\.step$/);
    assert.equal(sent.length, 1);
    assert.equal(sent[0].constructor.name, 'PutObjectCommand');
    assert.equal(sent[0].input.Bucket, 'milson-docs');
    assert.equal(sent[0].input.Key, key);
    assert.equal(sent[0].input.ServerSideEncryption, 'AES256');
    assert.deepEqual(sent[0].input.Body, Buffer.from('solid'));
    assert.equal(sent[0].input.ContentType, 'application/octet-stream');
  });

  it('downloads objects back into a Buffer', async () => {
    const bytes = new TextEncoder().encode('pdf-bytes');
    const { sent, client } = fakeS3(() => ({
      Body: { transformToByteArray: async () => bytes },
    }));
    const s3 = new S3DocumentStorage('milson-docs', client);

    const data = await s3.read('project-42/file.pdf');

    assert.equal(sent[0].constructor.name, 'GetObjectCommand');
    assert.equal(sent[0].input.Key, 'project-42/file.pdf');
    assert.deepEqual(data, Buffer.from('pdf-bytes'));
  });

  it('streams downloads for the authenticated download/preview endpoints', async () => {
    const { client } = fakeS3(() => ({ Body: Readable.from(['chunk1', 'chunk2']) }));
    const s3 = new S3DocumentStorage('milson-docs', client);

    const chunks: Buffer[] = [];
    for await (const chunk of s3.createReadStream('project-42/file.pdf')) {
      chunks.push(Buffer.from(chunk as Buffer));
    }

    assert.equal(Buffer.concat(chunks).toString(), 'chunk1chunk2');
  });

  it('reports existence via HeadObject', async () => {
    const { client } = fakeS3((cmd) => {
      if ((cmd.input.Key as string).includes('missing')) throw err('NotFound');
      return {};
    });
    const s3 = new S3DocumentStorage('milson-docs', client);

    assert.equal(await s3.exists('project-42/here.pdf'), true);
    assert.equal(await s3.exists('project-42/missing.pdf'), false);
  });

  it('propagates unexpected HeadObject errors', async () => {
    const { client } = fakeS3(() => {
      throw err('InternalError');
    });
    const s3 = new S3DocumentStorage('milson-docs', client);

    await assert.rejects(s3.exists('project-42/file.pdf'), /InternalError/);
  });

  it('sends DeleteObject and tolerates the no-delete IAM policy', async () => {
    const { sent, client } = fakeS3(() => {
      throw err('AccessDenied');
    });
    const s3 = new S3DocumentStorage('milson-docs', client);

    await s3.remove('project-42/file.pdf');

    assert.equal(sent[0].constructor.name, 'DeleteObjectCommand');
    assert.equal(sent[0].input.Key, 'project-42/file.pdf');
  });

  it('treats deletes of missing objects as a no-op', async () => {
    const { client } = fakeS3(() => {
      throw err('NoSuchKey');
    });
    const s3 = new S3DocumentStorage('milson-docs', client);
    await s3.remove('project-42/gone.pdf');
  });
});

describe('storageFor', () => {
  it('resolves and caches named drivers', () => {
    assert.equal(storageFor('local').driver, 'local');
    assert.equal(storageFor('local'), storageFor('local'));
  });

  it('rejects unknown drivers', () => {
    assert.throws(() => storageFor('ftp'), /Unsupported storage driver/);
  });

  it('requires all AWS env vars before selecting s3', () => {
    if (process.env.AWS_S3_BUCKET) return; // environment already configured
    assert.throws(() => storageFor('s3'), /STORAGE_DRIVER=s3 requires environment variables/);
  });

  it('round-trips files on the local driver', async () => {
    const local = storageFor('local');
    const key = await local.save(7, 'test-doc.pdf', Buffer.from('hello'), 'application/pdf');

    assert.equal(await local.exists(key), true);
    assert.deepEqual(await local.read(key), Buffer.from('hello'));

    await local.remove(key);
    assert.equal(await local.exists(key), false);
  });
});
