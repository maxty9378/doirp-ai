import { EgressClient } from 'livekit-server-sdk';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  try {
    const roomName = req.nextUrl.searchParams.get('roomName');

    if (roomName === null) {
      return new NextResponse('Missing roomName parameter', { status: 403 });
    }

    const { LIVEKIT_API_KEY, LIVEKIT_API_SECRET, LIVEKIT_URL, NEXT_PUBLIC_LIVEKIT_URL } =
      process.env;

    const sourceUrl = LIVEKIT_URL || NEXT_PUBLIC_LIVEKIT_URL;
    if (!sourceUrl || !LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) {
      return new NextResponse('LiveKit recording is not configured', { status: 500 });
    }

    const hostURL = new URL(sourceUrl);
    hostURL.protocol = 'https:';

    const egressClient = new EgressClient(hostURL.origin, LIVEKIT_API_KEY, LIVEKIT_API_SECRET);
    const activeEgresses = (await egressClient.listEgress({ roomName })).filter(
      (info) => info.status < 2,
    );

    if (activeEgresses.length === 0) {
      return new NextResponse('No active recording found', { status: 404 });
    }

    await Promise.all(activeEgresses.map((info) => egressClient.stopEgress(info.egressId)));

    return new NextResponse(null, { status: 200 });
  } catch (error) {
    if (error instanceof Error) {
      return new NextResponse(error.message, { status: 500 });
    }
  }
}

export const runtime = 'nodejs';
