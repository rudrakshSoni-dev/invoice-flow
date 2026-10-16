import { Global, Module } from '@nestjs/common';
import { Storage } from '@google-cloud/storage';
import { ENV } from '../common/env.module';
import type { Env } from '../common/env';
import { FILE_STORAGE, type FileStorage } from './file-storage';
import { GcsFileStorage } from './gcs-file-storage';
import { LocalFileStorage } from './local-file-storage';

/** Cloud Storage uses Application Default Credentials (the Cloud Run service account). */
export function createFileStorage(env: Env): FileStorage {
  return env.STORAGE_DRIVER === 'gcs'
    ? new GcsFileStorage(new Storage().bucket(env.GCS_BUCKET))
    : new LocalFileStorage(env.UPLOAD_DIR);
}

@Global()
@Module({
  providers: [{ provide: FILE_STORAGE, inject: [ENV], useFactory: createFileStorage }],
  exports: [FILE_STORAGE],
})
export class StorageModule {}
