import { NextResponse } from 'next/server';

import { FileS3 } from '@/server/modules/S3';

export const runtime = 'nodejs';

const unique = <T>(arr: T[]) => [...new Set(arr)];

const resolveCandidateKeys = (segments: string[]) => {
  const joined = segments.join('/');
  const prefixed = `voice-call/trainer-avatar/${joined}`;
  const withPrefixRemoved = joined.replace(/^voice-call\/trainer-avatar\//, '');

  return unique([prefixed, joined, `voice-call/trainer-avatar/${withPrefixRemoved}`]).filter(
    Boolean,
  );
};

export const GET = async (_req: Request, props: { params: Promise<{ path: string[] }> }) => {
  try {
    const params = await props.params;
    const { path } = params;

    if (!path || path.length === 0) {
      return new NextResponse('Invalid path', { status: 400 });
    }

    const s3 = new FileS3();
    const candidateKeys = resolveCandidateKeys(path);

    for (const key of candidateKeys) {
      try {
        const metadata = await s3.getFileMetadata(key);
        const content = await s3.getFileByteArray(key);
        const contentType = metadata.contentType || 'application/octet-stream';
        const responseBytes = new Uint8Array(content.byteLength);
        responseBytes.set(content);

        return new Response(responseBytes.buffer, {
          headers: {
            'Content-Length': metadata.contentLength.toString(),
            'Content-Type': contentType,
            'Cache-Control': 'public, max-age=31536000, immutable',
          },
          status: 200,
        });
      } catch {
        // try next candidate key
      }
    }

    return new NextResponse('File not found', { status: 404 });
  } catch (error) {
    console.error('Error serving file:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
};
