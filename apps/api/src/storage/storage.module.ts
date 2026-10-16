import { Global, Module } from '@nestjs/common';
import { ENV } from '../common/env.module';
import type { Env } from '../common/env';
import { FILE_STORAGE } from './file-storage';
import { LocalFileStorage } from './local-file-storage';

@Global()
@Module({
  providers: [
    {
      provide: FILE_STORAGE,
      inject: [ENV],
      useFactory: (env: Env) => new LocalFileStorage(env.UPLOAD_DIR),
    },
  ],
  exports: [FILE_STORAGE],
})
export class StorageModule {}
