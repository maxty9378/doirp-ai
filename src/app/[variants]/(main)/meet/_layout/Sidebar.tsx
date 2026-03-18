'use client';

import { memo, useLayoutEffect } from 'react';

import { clearNavPanelSnapshot, NavPanelPortal } from '@/features/NavPanel';
import SideBarLayout from '@/features/NavPanel/SideBarLayout';

import Body from './Body';
import Header from './Header';

const MeetSidebar = memo(() => {
  useLayoutEffect(
    () => () => {
      clearNavPanelSnapshot();
    },
    [],
  );

  return (
    <NavPanelPortal navKey="meet">
      <SideBarLayout body={<Body />} header={<Header />} />
    </NavPanelPortal>
  );
});

MeetSidebar.displayName = 'MeetSidebar';

export default MeetSidebar;
