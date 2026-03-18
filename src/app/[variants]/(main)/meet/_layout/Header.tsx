'use client';

import { memo } from 'react';

import SideBarHeaderLayout from '@/features/NavPanel/SideBarHeaderLayout';

const Header = memo(() => {
  return (
    <SideBarHeaderLayout
      title="Звонки"
    />
  );
});

Header.displayName = 'MeetSidebarHeader';

export default Header;
