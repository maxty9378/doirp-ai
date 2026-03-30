import { headers } from 'next/headers';
import { type NextRequest, NextResponse } from 'next/server';

import { auth } from '@/auth';
import { sanitizeVoiceCallTranscript } from '@/utils/voiceCallEchoFilter';

import { normalizeVoiceCallTranscriptWithGemini } from '../_normalizeTranscript';
import { transcribeVoiceCallAudioWithGoogle } from '../_speechToText';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const formData = await req.formData();
    const audio = formData.get('audio');

    if (!audio || !(audio instanceof File)) {
      return NextResponse.json({ error: 'Файл аудио не передан.' }, { status: 400 });
    }

    const audioBuffer = Buffer.from(await audio.arrayBuffer());
    if (audioBuffer.length === 0) {
      return NextResponse.json({ error: 'Аудиофайл пустой.' }, { status: 400 });
    }

    const sttResult = await transcribeVoiceCallAudioWithGoogle(
      audioBuffer,
      audio.type || 'audio/wav',
    );

    const normalizedSegments = await normalizeVoiceCallTranscriptWithGemini(
      sanitizeVoiceCallTranscript(
        sttResult.segments.map((segment) => ({ role: 'user' as const, text: segment.text })),
        { mode: 'store' },
      ),
      { force: true },
    );

    return NextResponse.json({
      segments: normalizedSegments.map((segment) => ({
        text: segment.text,
      })),
      transcriptText: normalizedSegments
        .map((segment) => segment.text)
        .join(' ')
        .trim(),
      transcriptSource: 'google-stt',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    console.error('[voice-call/transcribe] Server Error:', message, error);

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
