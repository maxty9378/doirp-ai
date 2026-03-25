'use client';

import { Flexbox, Text } from '@lobehub/ui';
import { ChatHeader } from '@lobehub/ui/mobile';
import { memo } from 'react';

import TrainingAgents from '@/app/[variants]/(main)/home/features/TrainingAgents';
import MobileContentLayout from '@/components/server/MobileNavLayout';
import { useUserStore } from '@/store/user';
import { authSelectors } from '@/store/user/slices/auth/selectors';
import { mobileHeaderSticky } from '@/styles/mobileHeader';

const MobileTrainingPage = memo(() => {
  const isLogin = useUserStore(authSelectors.isLogin);

  return (
    <MobileContentLayout
      withNav
      header={
        <ChatHeader
          style={mobileHeaderSticky}
          center={<ChatHeader.Title title={<span style={{ lineHeight: 1.2 }}>Тренажёры</span>} />}
        />
      }
      style={{ padding: 16, gap: 16 }}
    >
      {isLogin ? (
        <TrainingAgents compact />
      ) : (
        <Flexbox
          align="center"
          justify="center"
          style={{
            minHeight: 240,
            color: 'var(--colorTextSecondary)',
            textAlign: 'center',
            padding: 24,
          }}
        >
          <Text>Войдите в аккаунт, чтобы видеть тренажёры и запускать их.</Text>
        </Flexbox>
      )}
    </MobileContentLayout>
  );
});

MobileTrainingPage.displayName = 'MobileTrainingPage';

export default MobileTrainingPage;
