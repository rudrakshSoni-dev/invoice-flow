import type { Readable } from 'node:stream';

/** Seam for where uploaded invoice files live: local disk now, a bucket in production. */
export interface FileStorage {
  save(key: string, data: Buffer): Promise<void>;
  open(key: string): Promise<Readable>;
  remove(key: string): Promise<void>;
}

export const FILE_STORAGE = Symbol('FILE_STORAGE');
