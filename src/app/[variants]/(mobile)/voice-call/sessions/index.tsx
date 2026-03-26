'use client';

import { memo } from 'react';

import { VoiceCallSessionsPage } from '@/app/[variants]/(main)/voice-call/sessions';

const MobileVoiceCallSessionsPage = memo(() => <VoiceCallSessionsPage layoutMode="mobile" />);

MobileVoiceCallSessionsPage.displayName = 'MobileVoiceCallSessionsPage';

export default MobileVoiceCallSessionsPage;
