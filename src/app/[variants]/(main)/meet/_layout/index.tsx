'use client';

import { memo } from 'react';
import { Outlet } from 'react-router-dom';

const MeetLayout = memo(() => {
  return (
    <>
      <Outlet />
    </>
  );
});

MeetLayout.displayName = 'MeetLayout';

export default MeetLayout;
