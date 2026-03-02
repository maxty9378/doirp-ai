import { headers } from 'next/headers';
import { NextResponse } from 'next/server';

import { auth } from '@/auth';
import { AccessToken } from 'livekit-server-sdk';

const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY;
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET;

/**
 * GET /api/livekit
 * Returns a LiveKit Access Token for the current user to join a voice room.
 * Query: room (optional, default "voice-training"), agentId (optional).
 */
export async function GET(request: Request) {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) {
      return NextResponse.json(
        {
          error:
            'LIVEKIT_API_KEY and LIVEKIT_API_SECRET must be set in environment (e.g. .env)',
        },
        { status: 503 },
      );
    }

    const { searchParams } = new URL(request.url);
    const roomName = searchParams.get('room') || 'voice-training';
    const identity = session.user.id;

    const at = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
      identity,
      name: session.user.name ?? identity,
      ttl: '2h',
    });
    at.addGrant({
      roomJoin: true,
      room: roomName,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    });

    const token = await at.toJwt();
    return NextResponse.json({ token, roomName });
  } catch (error) {
    console.error('LiveKit token error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const runtime = 'nodejs';
