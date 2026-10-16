import type { Bucket } from '@google-cloud/storage';
import type { Readable } from 'node:stream';
import { NotFoundError } from '../common/domain-errors';
import type { FileStorage } from './file-storage';

/** Invoice files in a Cloud Storage bucket, for Cloud Run where local disk is ephemeral. */
export class GcsFileStorage implements FileStorage {
  constructor(
    private readonly bucket: Pick<Bucket, 'file'>,
    private readonly prefix = 'invoices/',
  ) {}

  async save(key: string, data: Buffer): Promise<void> {
    await this.file(key).save(data, { contentType: 'application/pdf', resumable: false });
  }

  async open(key: string): Promise<Readable> {
    const file = this.file(key);
    const [exists] = await file.exists();
    if (!exists) throw new NotFoundError(`File ${key} not found`);
    return file.createReadStream();
  }

  async remove(key: string): Promise<void> {
    await this.file(key).delete({ ignoreNotFound: true });
  }

  private file(key: string) {
    if (!/^[\w.-]+$/.test(key)) throw new Error(`Invalid storage key: ${key}`);
    return this.bucket.file(this.prefix + key);
  }
}
