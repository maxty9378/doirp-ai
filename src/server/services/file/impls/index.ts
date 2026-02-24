import { type LobeChatDatabase } from '@lobechat/database';

import { fileEnv } from '@/envs/file';

import { NoopFileServiceImpl } from './noop';
import { S3StaticFileImpl } from './s3';
import { type FileServiceImpl } from './type';

const isS3Configured = () =>
  !!(
    fileEnv.S3_ACCESS_KEY_ID &&
    fileEnv.S3_SECRET_ACCESS_KEY &&
    fileEnv.S3_ENDPOINT &&
    fileEnv.S3_BUCKET
  );

/**
 * Create file service module
 * Returns S3 implementation when configured, otherwise no-op so app runs without S3
 */
export const createFileServiceModule = (db: LobeChatDatabase): FileServiceImpl => {
  return isS3Configured() ? new S3StaticFileImpl(db) : new NoopFileServiceImpl();
};
