'use client';

import { memo } from 'react';

import { VoiceCallSessionDetailPage } from '@/app/[variants]/(main)/voice-call/sessions/[id]';

const MobileVoiceCallSessionDetailPage = memo(() => (
  <VoiceCallSessionDetailPage layoutMode="mobile" />
));

MobileVoiceCallSessionDetailPage.displayName = 'MobileVoiceCallSessionDetailPage';

export default MobileVoiceCallSessionDetailPage;
