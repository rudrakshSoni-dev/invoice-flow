import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { text } from 'node:stream/consumers';
import { NotFoundError } from '../common/domain-errors';
import { LocalFileStorage } from './local-file-storage';

describe('LocalFileStorage', () => {
  let root: string;
  let storage: LocalFileStorage;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'invoiceflow-storage-'));
    storage = new LocalFileStorage(root);
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('saves, opens, and removes files', async () => {
    await storage.save('a.pdf', Buffer.from('%PDF-1.4'));
    expect(await text(await storage.open('a.pdf'))).toBe('%PDF-1.4');
    await storage.remove('a.pdf');
    await expect(storage.open('a.pdf')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('refuses keys that escape the storage root', async () => {
    await expect(storage.save('../escape.pdf', Buffer.from('x'))).rejects.toThrow(
      'Invalid storage key',
    );
    await expect(storage.open('nested/a.pdf')).rejects.toThrow('Invalid storage key');
  });
});
