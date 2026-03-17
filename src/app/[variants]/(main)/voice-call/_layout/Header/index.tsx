'use client';

import { memo } from 'react';

import SideBarHeaderLayout from '@/features/NavPanel/SideBarHeaderLayout';

const Header = memo(() => (
  <SideBarHeaderLayout
    breadcrumb={[
      {
        href: '/voice-call',
        title: 'Сессии тренажёра',
      },
    ]}
  />
));

Header.displayName = 'VoiceCallSidebarHeader';

export default Header;
