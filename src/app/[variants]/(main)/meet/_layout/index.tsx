'use client';

import { Flexbox } from '@lobehub/ui';
import { memo, type FC } from 'react';
import { Outlet } from 'react-router-dom';

import Sidebar from './Sidebar';

const MeetLayout: FC = memo(() => {
  return (
    <>
      <Sidebar />
      <Flexbox flex={1} height="100%" style={{ position: 'relative' }}>
        <Outlet />
      </Flexbox>
    </>
  );
});

MeetLayout.displayName = 'MeetLayout';

export default MeetLayout;
