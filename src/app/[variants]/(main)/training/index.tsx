'use client';

import { Flexbox, Text } from '@lobehub/ui';
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
      <Flexbox
        height="100%"
        style={{ overflowY: 'auto', paddingBottom: '16vh', paddingInline: 16, paddingTop: 8 }}
        width="100%"
      >
        <WideScreenContainer>
          {isLogin ? (
            <>
              <TrainingAgents />
            </>
          ) : (
            <Flexbox
              align="center"
              justify="center"
              style={{
                minHeight: 280,
                color: 'var(--colorTextSecondary)',
                textAlign: 'center',
                padding: 24,
              }}
            >
              <Text>Войдите в аккаунт, чтобы видеть тренажёры и запускать их.</Text>
            </Flexbox>
          )}
        </WideScreenContainer>
      </Flexbox>
    </>
  );
});

TrainingPage.displayName = 'TrainingPage';

export default TrainingPage;
