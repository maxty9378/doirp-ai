'use client';

import { Flexbox } from '@lobehub/ui';
import { memo } from 'react';

import NavHeader from '@/features/NavHeader';
import WideScreenContainer from '@/features/WideScreenContainer';
import WideScreenButton from '@/features/WideScreenContainer/WideScreenButton';

import MeetWorkspace from './features/MeetWorkspace';

const DesktopMeetPage = memo(() => {
  return (
    <>
      <NavHeader right={<WideScreenButton />} title="Звонки ДОиРП" />
      <Flexbox height={'100%'} style={{ overflowY: 'auto', position: 'relative' }} width={'100%'}>
        <WideScreenContainer height={'100%'} wrapperStyle={{ height: '100%' }}>
          <MeetWorkspace />
        </WideScreenContainer>
      </Flexbox>
    </>
  );
});

DesktopMeetPage.displayName = 'DesktopMeetPage';

export default DesktopMeetPage;
