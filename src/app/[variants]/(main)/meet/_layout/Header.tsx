'use client';

import { memo } from 'react';

import SideBarHeaderLayout from '@/features/NavPanel/SideBarHeaderLayout';

const Header = memo(() => {
  return <SideBarHeaderLayout left="Звонки ДОиРП beta 1.2" />;
});

Header.displayName = 'MeetSidebarHeader';

export default Header;
