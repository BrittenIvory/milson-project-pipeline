import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { PassThrough, Readable } from 'stream';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { config } from '../config';

/**
 * Storage abstraction for project documents. Each document/part-image row
 * records the driver that wrote it (`storage_driver` / `part_image_storage_driver`),
 * so objects written by an earlier driver stay readable after the primary
 * driver changes. Resolve readers with `storageFor(row.storage_driver)`.
 */
export interface DocumentStorage {
  readonly driver: string;
  /** Persists bytes and returns the opaque key used to retrieve them later. */
  save(projectId: number, fileName: string, data: Buffer, mimeType?: string): Promise<string>;
  /** Returns a readable stream for a stored object. */
  createReadStream(key: string): Readable;
  read(key: string): Promise<Buffer>;
  remove(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
}

function objectKey(projectId: number, fileName: string): string {
  return path.posix.join(
    `project-${projectId}`,
    `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${path.extname(fileName).toLowerCase()}`,
  );
}

class LocalDiskStorage implements DocumentStorage {
  readonly driver = 'local';

  constructor(private readonly rootDir: string) {}

  private absolute(key: string): string {
    const resolved = path.resolve(this.rootDir, key);
    if (!resolved.startsWith(path.resolve(this.rootDir))) {
      throw new Error('Invalid storage key');
    }
    return resolved;
  }

  async save(projectId: number, fileName: string, data: Buffer): Promise<string> {
    const key = objectKey(projectId, fileName);
    const target = this.absolute(key);
    await fs.promises.mkdir(path.dirname(target), { recursive: true });
    await fs.promises.writeFile(target, data);
    return key;
  }

  createReadStream(key: string): Readable {
    return fs.createReadStream(this.absolute(key));
  }

  async read(key: string): Promise<Buffer> {
    return fs.promises.readFile(this.absolute(key));
  }

  async remove(key: string): Promise<void> {
    await fs.promises.rm(this.absolute(key), { force: true });
  }

  async exists(key: string): Promise<boolean> {
    try {
      await fs.promises.access(this.absolute(key));
      return true;
    } catch {
      return false;
    }
  }
}

/** Narrow send interface so tests can substitute a fake S3 client. */
export interface S3Sender {
  send(command: unknown): Promise<unknown>;
}

function s3ErrorName(err: unknown): string {
  if (err && typeof err === 'object') {
    const e = err as { name?: string; $metadata?: { httpStatusCode?: number } };
    if (e.name) return e.name;
    if (e.$metadata?.httpStatusCode === 404) return 'NotFound';
  }
  return '';
}

/**
 * Private-bucket S3 driver. All traffic goes through the authenticated API —
 * keys are never exposed and no presigned URLs are minted, so the bucket
 * stays fully private. Uploads use SSE-S3 (AES256) encryption at rest.
 *
 * The app IAM policy intentionally grants no s3:DeleteObject, so `remove`
 * treats AccessDenied as a no-op: the database row is still deleted and the
 * orphaned object can be cleared later with a lifecycle rule or an admin.
 */
export class S3DocumentStorage implements DocumentStorage {
  readonly driver = 's3';

  constructor(
    private readonly bucket: string,
    private readonly client: S3Sender,
  ) {}

  async save(projectId: number, fileName: string, data: Buffer, mimeType?: string): Promise<string> {
    const key = objectKey(projectId, fileName);
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: data,
        ContentType: mimeType ?? 'application/octet-stream',
        ServerSideEncryption: 'AES256',
      }),
    );
    return key;
  }

  createReadStream(key: string): Readable {
    const stream = new PassThrough();
    let body: Readable | undefined;
    // A destroyed/closed consumer (e.g. a cancelled HTTP download) must also
    // release the upstream S3 body so the connection isn't held until timeout.
    stream.once('close', () => body?.destroy());
    this.client
      .send(new GetObjectCommand({ Bucket: this.bucket, Key: key }))
      .then((result) => {
        body = (result as { Body?: Readable }).Body;
        if (!body) {
          stream.destroy(new Error('S3 object has no body'));
          return;
        }
        if (stream.destroyed) {
          body.destroy();
          return;
        }
        body.once('error', (err) => stream.destroy(err));
        body.pipe(stream);
      })
      .catch((err) => stream.destroy(err instanceof Error ? err : new Error(String(err))));
    return stream;
  }

  async read(key: string): Promise<Buffer> {
    const result = (await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
    )) as { Body?: { transformToByteArray(): Promise<Uint8Array> } };
    if (!result.Body) throw new Error('S3 object has no body');
    return Buffer.from(await result.Body.transformToByteArray());
  }

  async exists(key: string): Promise<boolean> {
    try {
      await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return true;
    } catch (err) {
      const name = s3ErrorName(err);
      if (name === 'NotFound' || name === 'NoSuchKey') return false;
      throw err;
    }
  }

  async remove(key: string): Promise<void> {
    try {
      await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
    } catch (err) {
      const name = s3ErrorName(err);
      if (name === 'NoSuchKey' || name === 'NotFound') return;
      if (name === 'AccessDenied') {
        console.warn(`S3 delete skipped (no s3:DeleteObject grant): ${key}`);
        return;
      }
      throw err;
    }
  }
}

const drivers = new Map<string, DocumentStorage>();

function createS3Storage(): DocumentStorage {
  const missing = [
    ['AWS_ACCESS_KEY_ID', config.awsAccessKeyId],
    ['AWS_SECRET_ACCESS_KEY', config.awsSecretAccessKey],
    ['AWS_REGION', config.awsRegion],
    ['AWS_S3_BUCKET', config.awsS3Bucket],
  ]
    .filter(([, value]) => !value)
    .map(([name]) => name);
  if (missing.length > 0) {
    throw new Error(`STORAGE_DRIVER=s3 requires environment variables: ${missing.join(', ')}`);
  }
  const client = new S3Client({
    region: config.awsRegion,
    credentials: {
      accessKeyId: config.awsAccessKeyId,
      secretAccessKey: config.awsSecretAccessKey,
    },
  });
  return new S3DocumentStorage(config.awsS3Bucket, client);
}

/** Resolves a storage driver by name, creating and caching it on first use. */
export function storageFor(driver: string): DocumentStorage {
  const existing = drivers.get(driver);
  if (existing) return existing;
  let created: DocumentStorage;
  switch (driver) {
    case 'local':
      created = new LocalDiskStorage(config.storageDir);
      break;
    case 's3':
      created = createS3Storage();
      break;
    default:
      throw new Error(`Unsupported storage driver: ${driver}`);
  }
  drivers.set(driver, created);
  return created;
}

/** Primary storage driver used for all new writes. */
export const storage = storageFor(config.storageDriver);

/**
 * Pipes a stored object into an HTTP response. `pipe` alone neither forwards
 * source errors (which would crash the process on an unhandled 'error') nor
 * notifies the source on client disconnect — this handles both.
 */
export function streamToResponse(
  stream: Readable,
  res: import('express').Response,
): void {
  res.once('close', () => stream.destroy());
  stream.once('error', () => {
    // setHeader marks headers but doesn't flush them — while nothing has been
    // sent the client can still get a real HTTP error instead of a dropped
    // connection. Once bytes are in flight, only destroy remains.
    if (!res.headersSent) {
      res.removeHeader('Content-Type');
      res.removeHeader('Content-Disposition');
      res.status(500).end();
      return;
    }
    res.destroy();
  });
  stream.pipe(res);
}

/** File extensions accepted by the document module. */
export const ALLOWED_EXTENSIONS = [
  'pdf', 'dwg', 'dxf', 'step', 'stp', 'sldprt', 'sldasm',
  'x_t', 'x_b', 'iges', 'igs', 'zip', 'png', 'jpg', 'jpeg', 'docx', 'xlsx',
];

/** Returns the lowercase extension of a file name, without the dot. */
export function extensionOf(fileName: string): string {
  return path.extname(fileName).replace('.', '').toLowerCase();
}
