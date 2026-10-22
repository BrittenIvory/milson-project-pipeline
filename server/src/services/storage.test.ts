import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { PassThrough, Readable } from 'node:stream';
import { S3DocumentStorage, storageFor, streamToResponse, mimeTypeFor, isPreviewableExtension, contentMatchesExtension } from './storage';

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

  it('emits an error when GetObject fails instead of crashing', async () => {
    const { client } = fakeS3(() => {
      throw err('InternalError');
    });
    const s3 = new S3DocumentStorage('milson-docs', client);

    const stream = s3.createReadStream('project-42/file.pdf');
    await assert.rejects(
      new Promise((resolve, reject) => {
        stream.once('error', reject);
        stream.once('data', resolve);
        stream.resume();
      }),
      /InternalError/,
    );
  });

  it('propagates S3 body errors to the consumer stream', async () => {
    const body = new PassThrough();
    const { client } = fakeS3(() => ({ Body: body }));
    const s3 = new S3DocumentStorage('milson-docs', client);

    const stream = s3.createReadStream('project-42/file.pdf');
    const failure = new Promise<Error>((resolve) => stream.once('error', resolve));
    await new Promise((resolve) => setImmediate(resolve));
    body.destroy(new Error('connection reset'));

    assert.match((await failure).message, /connection reset/);
  });

  it('destroys the S3 body when the consumer disconnects mid-stream', async () => {
    const body = new PassThrough();
    let bodyDestroyed = false;
    body.on('close', () => {
      bodyDestroyed = true;
    });
    const { client } = fakeS3(() => ({ Body: body }));
    const s3 = new S3DocumentStorage('milson-docs', client);

    const stream = s3.createReadStream('project-42/file.pdf');
    await new Promise((resolve) => setImmediate(resolve)); // let GetObject resolve
    stream.destroy();
    await new Promise((resolve) => setImmediate(resolve));

    assert.equal(bodyDestroyed, true);
  });

  it('cleans up when the consumer is already gone before GetObject resolves', async () => {
    let resolveSend: (value: unknown) => void = () => undefined;
    const { client } = fakeS3(
      () => new Promise((resolve) => { resolveSend = resolve; }),
    );
    const s3 = new S3DocumentStorage('milson-docs', client);

    const stream = s3.createReadStream('project-42/file.pdf');
    stream.destroy();

    const body = new PassThrough();
    let bodyDestroyed = false;
    body.on('close', () => {
      bodyDestroyed = true;
    });
    resolveSend({ Body: body });
    await new Promise((resolve) => setImmediate(resolve));

    assert.equal(bodyDestroyed, true);
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

describe('streamToResponse', () => {
  const asResponse = (stream: PassThrough) => stream as unknown as import('express').Response;

  it('returns a 500 when the source errors before bytes are sent', async () => {
    const source = new PassThrough();
    const res = new PassThrough() as PassThrough & {
      headersSent: boolean;
      statusCode: number;
      removedHeaders: string[];
      status(code: number): PassThrough;
      removeHeader(name: string): void;
    };
    res.headersSent = false;
    res.removedHeaders = [];
    res.status = (code: number) => {
      res.statusCode = code;
      return res;
    };
    res.removeHeader = (name: string) => {
      res.removedHeaders.push(name);
    };
    streamToResponse(source, asResponse(res));

    source.destroy(new Error('s3 failure'));
    await new Promise((resolve) => setImmediate(resolve));

    assert.equal(res.statusCode, 500);
    assert.equal(res.destroyed, false);
    assert.deepEqual(res.removedHeaders, ['Content-Type', 'Content-Disposition']);
  });

  it('destroys the response when the source stream errors mid-flight', async () => {
    const source = new PassThrough();
    const res = new PassThrough() as PassThrough & { headersSent: boolean };
    res.headersSent = true;
    streamToResponse(source, asResponse(res));

    source.destroy(new Error('s3 failure'));
    await new Promise((resolve) => setImmediate(resolve));

    assert.equal(res.destroyed, true);
  });

  it('destroys the source stream when the client disconnects', async () => {
    const source = new PassThrough();
    const res = new PassThrough();
    streamToResponse(source, asResponse(res));

    res.destroy();
    await new Promise((resolve) => setImmediate(resolve));

    assert.equal(source.destroyed, true);
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

describe('mimeTypeFor', () => {
  it('maps allowed extensions to the right MIME types', () => {
    assert.equal(mimeTypeFor('pdf'), 'application/pdf');
    assert.equal(mimeTypeFor('png'), 'image/png');
    assert.equal(mimeTypeFor('jpeg'), 'image/jpeg');
    assert.equal(mimeTypeFor('step'), 'application/step');
    assert.equal(mimeTypeFor('zip'), 'application/zip');
  });

  it('falls back to octet-stream for unknown types instead of trusting the client', () => {
    assert.equal(mimeTypeFor('sldprt'), 'application/octet-stream');
    assert.equal(mimeTypeFor('dwg'), 'application/octet-stream');
    assert.equal(mimeTypeFor('exe'), 'application/octet-stream');
  });
});

describe('isPreviewableExtension', () => {
  it('only previews PDFs and images', () => {
    for (const ext of ['pdf', 'png', 'jpg', 'jpeg']) {
      assert.equal(isPreviewableExtension(ext), true, ext);
    }
    for (const ext of ['step', 'zip', 'docx', 'xlsx', 'dwg', 'sldprt', '']) {
      assert.equal(isPreviewableExtension(ext), false, ext);
    }
  });
});

describe('contentMatchesExtension', () => {
  it('verifies magic bytes for previewable types', () => {
    assert.equal(contentMatchesExtension('pdf', Buffer.from('%PDF-1.7 rest')), true);
    assert.equal(contentMatchesExtension('pdf', Buffer.from('<html><script>1</script>')), false);
    assert.equal(
      contentMatchesExtension('png', Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1])),
      true,
    );
    assert.equal(contentMatchesExtension('png', Buffer.from('GIF89a...')), false);
    assert.equal(contentMatchesExtension('jpg', Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0])), true);
    assert.equal(contentMatchesExtension('jpg', Buffer.from('not an image')), false);
  });

  it('does not require signatures for download-only types', () => {
    assert.equal(contentMatchesExtension('step', Buffer.from('ISO-10303-21;')), true);
    assert.equal(contentMatchesExtension('zip', Buffer.from('anything')), true);
  });
});
