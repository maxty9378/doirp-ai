import { AccessToken } from 'livekit-server-sdk';
import { headers } from 'next/headers';
import { NextResponse } from 'next/server';

import { auth } from '@/auth';

export async function GET(req: Request) {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const room = searchParams.get('room');

    if (!room) {
      return NextResponse.json({ error: 'Missing "room" query parameter' }, { status: 400 });
    }

    const apiKey = process.env.LIVEKIT_API_KEY;
    const apiSecret = process.env.LIVEKIT_API_SECRET;

    if (!apiKey || !apiSecret) {
      return NextResponse.json({ error: 'LiveKit credentials are not configured' }, { status: 500 });
    }

    const participantName = session.user.name || session.user.id;

    const at = new AccessToken(apiKey, apiSecret, {
      identity: session.user.id,
      name: participantName,
    });

    at.addGrant({ roomJoin: true, room, canPublish: true, canSubscribe: true });

    return NextResponse.json({ token: await at.toJwt() });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export const runtime = 'nodejs';
