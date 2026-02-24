'use client';

import { Flexbox } from '@lobehub/ui';
import { type FC } from 'react';
import { Outlet } from 'react-router-dom';

import { AdminGuard } from '@/components/AdminGuard';

import Sidebar from './Sidebar';
import { styles } from './style';

const DesktopMemoryLayout: FC = () => {
  return (
    <AdminGuard>
      <Sidebar />
      <Flexbox className={styles.mainContainer} flex={1} height={'100%'}>
        <Outlet />
      </Flexbox>
    </AdminGuard>
  );
};

export default DesktopMemoryLayout;
