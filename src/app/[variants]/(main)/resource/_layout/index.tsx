'use client';

import { type FC } from 'react';
import { Outlet } from 'react-router-dom';

import RegisterHotkeys from './RegisterHotkeys';
import ResourceAssistantPopup from './ResourceAssistantPopup';

const ResourceLayout: FC = () => {
  return (
    <>
      <Outlet />
      <RegisterHotkeys />
      <ResourceAssistantPopup />
    </>
  );
};

export default ResourceLayout;
