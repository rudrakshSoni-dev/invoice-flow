import { createReadStream } from 'node:fs';
import { access, mkdir, rm, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import type { Readable } from 'node:stream';
import { NotFoundError } from '../common/domain-errors';
import type { FileStorage } from './file-storage';

export class LocalFileStorage implements FileStorage {
  private readonly root: string;

  constructor(root: string) {
    this.root = resolve(root);
  }

  async save(key: string, data: Buffer): Promise<void> {
    await mkdir(this.root, { recursive: true });
    await writeFile(this.pathFor(key), data);
  }

  async open(key: string): Promise<Readable> {
    const path = this.pathFor(key);
    try {
      await access(path);
    } catch {
      throw new NotFoundError(`File ${key} not found`);
    }
    return createReadStream(path);
  }

  async remove(key: string): Promise<void> {
    await rm(this.pathFor(key), { force: true });
  }

  private pathFor(key: string): string {
    if (basename(key) !== key) throw new Error(`Invalid storage key: ${key}`);
    return join(this.root, key);
  }
}
