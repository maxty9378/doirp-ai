import type { FileServiceImpl } from './type';

const S3_NOT_CONFIGURED =
  'S3 environment variables are not set. Set S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, S3_ENDPOINT, S3_BUCKET in .env to enable file storage.';

/**
 * No-op file implementation when S3 is not configured.
 * Allows app to run without S3; upload/delete operations throw a clear error.
 */
export class NoopFileServiceImpl implements FileServiceImpl {
  createPreSignedUrl = async (): Promise<string> => '';
  createPreSignedUrlForPreview = async (): Promise<string> => '';
  deleteFile = async (): Promise<void> => {
    throw new Error(S3_NOT_CONFIGURED);
  };
  deleteFiles = async (): Promise<void> => {
    throw new Error(S3_NOT_CONFIGURED);
  };
  getFileByteArray = async (): Promise<Uint8Array> => new Uint8Array(0);
  getFileContent = async (): Promise<string> => '';
  getFileMetadata = async (): Promise<{ contentLength: number; contentType?: string }> => ({
    contentLength: 0,
  });
  getFullFileUrl = async (url?: string | null): Promise<string> => url ?? '';
  getKeyFromFullUrl = async (): Promise<string | null> => null;
  uploadBuffer = async (): Promise<{ key: string }> => {
    throw new Error(S3_NOT_CONFIGURED);
  };
  uploadContent = async (): Promise<void> => {
    throw new Error(S3_NOT_CONFIGURED);
  };
  uploadMedia = async (): Promise<{ key: string }> => {
    throw new Error(S3_NOT_CONFIGURED);
  };
}
