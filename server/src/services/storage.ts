import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { config } from '../config';

/**
 * Storage abstraction for project documents. Phase 1 ships a local-disk driver;
 * an S3/GCS driver only needs to implement this interface and be registered in
 * `createStorage`, with no changes to routes or the database schema.
 */
export interface DocumentStorage {
  readonly driver: string;
  /** Persists bytes and returns the opaque key used to retrieve them later. */
  save(projectId: number, fileName: string, data: Buffer): Promise<string>;
  /** Returns a readable stream for a stored object. */
  createReadStream(key: string): NodeJS.ReadableStream;
  remove(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
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
    const key = path.posix.join(
      `project-${projectId}`,
      `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${path.extname(fileName).toLowerCase()}`,
    );
    const target = this.absolute(key);
    await fs.promises.mkdir(path.dirname(target), { recursive: true });
    await fs.promises.writeFile(target, data);
    return key;
  }

  createReadStream(key: string): NodeJS.ReadableStream {
    return fs.createReadStream(this.absolute(key));
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

/** Resolves the configured storage driver. */
export function createStorage(): DocumentStorage {
  switch (config.storageDriver) {
    case 'local':
      return new LocalDiskStorage(config.storageDir);
    default:
      throw new Error(`Unsupported STORAGE_DRIVER: ${config.storageDriver}`);
  }
}

export const storage = createStorage();

/** File extensions accepted by the document module. */
export const ALLOWED_EXTENSIONS = [
  'pdf', 'dwg', 'dxf', 'step', 'stp', 'sldprt', 'sldasm',
  'x_t', 'x_b', 'iges', 'igs', 'zip', 'png', 'jpg', 'jpeg', 'docx', 'xlsx',
];

/** Returns the lowercase extension of a file name, without the dot. */
export function extensionOf(fileName: string): string {
  return path.extname(fileName).replace('.', '').toLowerCase();
}
