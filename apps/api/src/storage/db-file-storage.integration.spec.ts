import { PrismaClient } from '@prisma/client';
import { text } from 'node:stream/consumers';
import { NotFoundError } from '../common/domain-errors';
import { DbFileStorage } from './db-file-storage';

describe('DbFileStorage', () => {
  const prisma = new PrismaClient();
  const storage = new DbFileStorage(prisma);

  beforeEach(() => prisma.storedFile.deleteMany());
  afterAll(() => prisma.$disconnect());

  it('saves, overwrites, opens, and removes files', async () => {
    await storage.save('a.pdf', Buffer.from('%PDF-1.3'));
    await storage.save('a.pdf', Buffer.from('%PDF-1.4'));
    expect(await text(await storage.open('a.pdf'))).toBe('%PDF-1.4');
    await storage.remove('a.pdf');
    await expect(storage.open('a.pdf')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('ignores removing a missing file', async () => {
    await expect(storage.remove('missing.pdf')).resolves.toBeUndefined();
  });
});
