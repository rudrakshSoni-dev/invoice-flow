import type { PrismaClient } from '@prisma/client';
import { Readable } from 'node:stream';
import { NotFoundError } from '../common/domain-errors';
import type { FileStorage } from './file-storage';

/** Invoice files as Postgres rows, for hosts with no durable disk and no bucket (e.g. Render). */
export class DbFileStorage implements FileStorage {
  constructor(private readonly prisma: Pick<PrismaClient, 'storedFile'>) {}

  async save(key: string, buffer: Buffer): Promise<void> {
    const data = new Uint8Array(buffer);
    await this.prisma.storedFile.upsert({
      where: { key },
      create: { key, data },
      update: { data },
    });
  }

  async open(key: string): Promise<Readable> {
    const file = await this.prisma.storedFile.findUnique({ where: { key } });
    if (!file) throw new NotFoundError(`File ${key} not found`);
    return Readable.from(Buffer.from(file.data));
  }

  async remove(key: string): Promise<void> {
    await this.prisma.storedFile.deleteMany({ where: { key } });
  }
}
