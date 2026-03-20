import { randomUUID } from 'node:crypto';

import { AccessToken } from 'livekit-server-sdk';
import { headers } from 'next/headers';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { getLiveKitURL } from '@/app/[variants]/(main)/meet/features/getLiveKitURL';
import { auth } from '@/auth';

type ConnectionDetails = {
  participantName: string;
  participantToken: string;
  roomName: string;
  serverUrl: string;
};

const COOKIE_KEY = 'livekit-meet-participant-postfix';

const getRandomPostfix = () => randomUUID().replaceAll('-', '').slice(0, 6);

export async function GET(request: NextRequest) {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    const roomName = request.nextUrl.searchParams.get('roomName');
    const requestedParticipantName = request.nextUrl.searchParams.get('participantName')?.trim();
    const region = request.nextUrl.searchParams.get('region');

    if (!roomName) {
      return NextResponse.json({ error: 'Missing "roomName" query parameter' }, { status: 400 });
    }

    const participantName =
      session?.user?.name?.trim() || requestedParticipantName || session?.user?.email || '';

    if (!participantName) {
      return NextResponse.json(
        { error: 'Missing "participantName" query parameter' },
        { status: 400 },
      );
    }

    const apiKey = process.env.LIVEKIT_API_KEY;
    const apiSecret = process.env.LIVEKIT_API_SECRET;
    const sourceServerUrl = process.env.NEXT_PUBLIC_LIVEKIT_URL || process.env.LIVEKIT_URL;

    if (!apiKey || !apiSecret || !sourceServerUrl) {
      return NextResponse.json(
        { error: 'LiveKit credentials are not configured' },
        { status: 500 },
      );
    }

    const serverUrl = getLiveKitURL(sourceServerUrl, region);

    const cookiePostfix = request.cookies.get(COOKIE_KEY)?.value || getRandomPostfix();
    const identityBase = session?.user?.id || participantName;
    const identity = `${identityBase}__${cookiePostfix}`;

    const accessToken = new AccessToken(apiKey, apiSecret, {
      identity,
      metadata: session?.user?.id ? JSON.stringify({ userId: session.user.id }) : undefined,
      name: participantName,
    });

    accessToken.ttl = '5m';
    accessToken.addGrant({
      canPublish: true,
      canPublishData: true,
      canSubscribe: true,
      room: roomName,
      roomJoin: true,
    });

    const data: ConnectionDetails = {
      participantName,
      participantToken: await accessToken.toJwt(),
      roomName,
      serverUrl,
    };

    const response = NextResponse.json(data);
    response.cookies.set(COOKIE_KEY, cookiePostfix, {
      httpOnly: true,
      maxAge: 60 * 60 * 2,
      path: '/',
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
    });

    return response;
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export const runtime = 'nodejs';
