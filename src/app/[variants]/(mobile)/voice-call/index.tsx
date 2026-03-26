'use client';

import { memo } from 'react';

import { VoiceCallPage } from '@/app/[variants]/(main)/voice-call';

const MobileVoiceCallPage = memo(() => <VoiceCallPage layoutMode="mobile" />);

MobileVoiceCallPage.displayName = 'MobileVoiceCallPage';

export default MobileVoiceCallPage;
