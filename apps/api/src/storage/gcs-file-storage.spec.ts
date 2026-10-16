import type { Bucket } from '@google-cloud/storage';
import { Readable } from 'node:stream';
import { text } from 'node:stream/consumers';
import { NotFoundError } from '../common/domain-errors';
import { GcsFileStorage } from './gcs-file-storage';

/** Just enough of the Cloud Storage File API, backed by a Map. */
function fakeBucket() {
  const objects = new Map<string, Buffer>();
  const bucket = {
    file: (name: string) => ({
      save: async (data: Buffer) => void objects.set(name, data),
      exists: async () => [objects.has(name)],
      createReadStream: () => Readable.from([objects.get(name)!]),
      delete: async () => void objects.delete(name),
    }),
  };
  return { objects, bucket: bucket as unknown as Pick<Bucket, 'file'> };
}

describe('GcsFileStorage', () => {
  it('saves, opens, and removes objects under the prefix', async () => {
    const { objects, bucket } = fakeBucket();
    const storage = new GcsFileStorage(bucket);

    await storage.save('a.pdf', Buffer.from('%PDF-1.4'));
    expect([...objects.keys()]).toEqual(['invoices/a.pdf']);
    expect(await text(await storage.open('a.pdf'))).toBe('%PDF-1.4');

    await storage.remove('a.pdf');
    await expect(storage.open('a.pdf')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('refuses keys with path separators', async () => {
    const storage = new GcsFileStorage(fakeBucket().bucket);
    await expect(storage.save('../x.pdf', Buffer.from('x'))).rejects.toThrow('Invalid storage key');
  });
});
