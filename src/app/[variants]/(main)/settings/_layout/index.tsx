'use client';

import { Flexbox } from '@lobehub/ui';
import { type FC } from 'react';
import { Outlet } from 'react-router-dom';

import SideBar from '@/app/[variants]/(main)/settings/_layout/SideBar';
import { AdminGuard } from '@/components/AdminGuard';

import SettingsContextProvider from './ContextProvider';
import { styles } from './style';

const Layout: FC = () => {
  return (
    <AdminGuard>
      <SettingsContextProvider
        value={{
          showOpenAIApiKey: true,
          showOpenAIProxyUrl: true,
        }}
      >
        <SideBar />
        <Flexbox className={styles.mainContainer} flex={1} height={'100%'}>
          <Outlet />
        </Flexbox>
      </SettingsContextProvider>
    </AdminGuard>
  );
};

export default Layout;
