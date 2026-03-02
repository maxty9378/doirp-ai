import { uuid } from '@lobechat/utils';
import { headers } from 'next/headers';
import { type NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { auth } from '@/auth';
import { fileEnv } from '@/envs/file';
import { FileS3 } from '@/server/modules/S3';

export const runtime = 'nodejs';

const DEFAULT_S3_FILE_PATH = 'files';

/**
 * POST /api/upload/s3 — upload file via server (avoids CORS with S3).
 * Body: multipart/form-data with "file" (required).
 * Returns: { date, dirname, filename, path } (FileMetadata shape).
 * Requires authenticated session.
 */
export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!fileEnv.S3_ENDPOINT || !fileEnv.S3_BUCKET) {
    return NextResponse.json(
      { error: 'S3 is not configured (S3_ENDPOINT, S3_BUCKET)' },
      { status: 503 },
    );
  }

  try {
    const formData = await req.formData();
    const file = formData.get('file');
    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: 'Missing or invalid file' }, { status: 400 });
    }

    const directory =
      (formData.get('directory') as string) || fileEnv.NEXT_PUBLIC_S3_FILE_PATH || DEFAULT_S3_FILE_PATH;
    const date = (Date.now() / 1000 / 60 / 60).toFixed(0);
    const ext = file.name.split('.').at(-1) || 'bin';
    const filename = `${uuid()}.${ext}`;
    const dirname = `${directory}/${date}`;
    const pathname = `${dirname}/${filename}`;

    const buffer = Buffer.from(await file.arrayBuffer());
    const s3 = new FileS3();
    await s3.uploadBuffer(pathname, buffer, file.type || undefined);

    return NextResponse.json({
      date,
      dirname,
      filename,
      path: pathname,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Upload S3 proxy error:', message, error);
    return NextResponse.json(
      { error: process.env.NODE_ENV === 'development' ? message : 'Upload failed' },
      { status: 500 },
    );
  }
}
