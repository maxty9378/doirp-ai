import { EgressClient, EncodedFileOutput, S3Upload } from 'livekit-server-sdk';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  try {
    const roomName = req.nextUrl.searchParams.get('roomName');

    if (roomName === null) {
      return new NextResponse('Missing roomName parameter', { status: 403 });
    }

    const {
      LIVEKIT_API_KEY,
      LIVEKIT_API_SECRET,
      LIVEKIT_URL,
      NEXT_PUBLIC_LIVEKIT_URL,
      S3_BUCKET,
      S3_ENDPOINT,
      S3_KEY_ID,
      S3_KEY_SECRET,
      S3_REGION,
    } = process.env;

    const sourceUrl = LIVEKIT_URL || NEXT_PUBLIC_LIVEKIT_URL;
    if (!sourceUrl || !LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) {
      return new NextResponse('LiveKit recording is not configured', { status: 500 });
    }

    const hostURL = new URL(sourceUrl);
    hostURL.protocol = 'https:';

    const egressClient = new EgressClient(hostURL.origin, LIVEKIT_API_KEY, LIVEKIT_API_SECRET);
    const existingEgresses = await egressClient.listEgress({ roomName });

    if (existingEgresses.some((e) => e.status < 2)) {
      return new NextResponse('Meeting is already being recorded', { status: 409 });
    }

    const fileOutput = new EncodedFileOutput({
      filepath: `${new Date(Date.now()).toISOString()}-${roomName}.mp4`,
      output: {
        case: 's3',
        value: new S3Upload({
          accessKey: S3_KEY_ID,
          bucket: S3_BUCKET,
          endpoint: S3_ENDPOINT,
          region: S3_REGION,
          secret: S3_KEY_SECRET,
        }),
      },
    });

    await egressClient.startRoomCompositeEgress(
      roomName,
      {
        file: fileOutput,
      },
      {
        layout: 'speaker',
      },
    );

    return new NextResponse(null, { status: 200 });
  } catch (error) {
    if (error instanceof Error) {
      return new NextResponse(error.message, { status: 500 });
    }
  }
}

export const runtime = 'nodejs';
