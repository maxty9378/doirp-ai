'use client';

import { memo } from 'react';

import SessionList from './SessionList';

const Body = memo(() => (
  <>
    <SessionList />
  </>
));

Body.displayName = 'VoiceCallSidebarBody';

export default Body;
