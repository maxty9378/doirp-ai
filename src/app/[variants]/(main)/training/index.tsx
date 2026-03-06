'use client';

import { Flexbox } from '@lobehub/ui';
import { memo } from 'react';

import PageTitle from '@/components/PageTitle';
import NavHeader from '@/features/NavHeader';
import WideScreenContainer from '@/features/WideScreenContainer';
import WideScreenButton from '@/features/WideScreenContainer/WideScreenButton';
import { useUserStore } from '@/store/user';
import { authSelectors } from '@/store/user/slices/auth/selectors';

import TrainingAgents from '../home/features/TrainingAgents';

const TrainingPage = memo(() => {
  const isLogin = useUserStore(authSelectors.isLogin);

  return (
    <>
      <PageTitle title="Тренажеры" />
      <NavHeader right={<WideScreenButton />} />
      <Flexbox height={'100%'} style={{ overflowY: 'auto', paddingBottom: '16vh' }} width={'100%'}>
        <WideScreenContainer>{isLogin && <TrainingAgents />}</WideScreenContainer>
      </Flexbox>
    </>
  );
});

TrainingPage.displayName = 'TrainingPage';

export default TrainingPage;
