'use client';

import { memo, useLayoutEffect } from 'react';

import { clearNavPanelSnapshot, NavPanelPortal } from '@/features/NavPanel';
import SideBarLayout from '@/features/NavPanel/SideBarLayout';

import Body from './Body';
import Header from './Header';

const VoiceCallSidebar = memo(() => {
  useLayoutEffect(
    () => () => {
      clearNavPanelSnapshot();
    },
    [],
  );

  return (
    <NavPanelPortal navKey="voice-call">
      <SideBarLayout body={<Body />} header={<Header />} />
    </NavPanelPortal>
  );
});

VoiceCallSidebar.displayName = 'VoiceCallSidebar';

export default VoiceCallSidebar;
