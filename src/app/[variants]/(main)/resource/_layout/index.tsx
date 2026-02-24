'use client';

import { type FC } from 'react';
import { Outlet } from 'react-router-dom';

import { AdminGuard } from '@/components/AdminGuard';

import RegisterHotkeys from './RegisterHotkeys';

const ResourceLayout: FC = () => {
  return (
    <AdminGuard>
      <Outlet />
      <RegisterHotkeys />
    </AdminGuard>
  );
};

export default ResourceLayout;
