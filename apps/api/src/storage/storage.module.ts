import { Global, Module } from '@nestjs/common';
import { Storage } from '@google-cloud/storage';
import type { PrismaClient } from '@prisma/client';
import { ENV } from '../common/env.module';
import type { Env } from '../common/env';
import { PrismaService } from '../common/prisma.service';
import { DbFileStorage } from './db-file-storage';
import { FILE_STORAGE, type FileStorage } from './file-storage';
import { GcsFileStorage } from './gcs-file-storage';
import { LocalFileStorage } from './local-file-storage';

/** Cloud Storage uses Application Default Credentials (the Cloud Run service account). */
export function createFileStorage(env: Env, prisma: Pick<PrismaClient, 'storedFile'>): FileStorage {
  switch (env.STORAGE_DRIVER) {
    case 'gcs':
      return new GcsFileStorage(new Storage().bucket(env.GCS_BUCKET));
    case 'db':
      return new DbFileStorage(prisma);
    case 'local':
      return new LocalFileStorage(env.UPLOAD_DIR);
  }
}

@Global()
@Module({
  providers: [
    { provide: FILE_STORAGE, inject: [ENV, PrismaService], useFactory: createFileStorage },
  ],
  exports: [FILE_STORAGE],
})
export class StorageModule {}
