'use client';

import { type IconProps } from '@lobehub/ui';
import { Block, Button, Flexbox, Icon, Text } from '@lobehub/ui';
import { TypewriterEffect } from '@lobehub/ui/awesome';
import { LoadingDots } from '@lobehub/ui/chat';
import { Steps } from 'antd';
import { createStaticStyles, cssVar, keyframes } from 'antd-style';
import { BrainIcon, HeartHandshakeIcon, PencilRulerIcon } from 'lucide-react';
import { memo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import { ProductLogo } from '@/components/Branding';
import NeuralNetworkLoading from '@/components/NeuralNetworkLoading';
import { useUserStore } from '@/store/user';

const LOGO_SIZE = 40;
const AI_ICON_SIZE = 32;

const aiPulseKeyframes = keyframes`
  0%, 100% { opacity: 0; }
  50% { opacity: 1; }
`;

const styles = createStaticStyles(({ css }) => ({
  aiPulse: css`
    animation: ${aiPulseKeyframes} 3s ease-in-out infinite;
  `,
}));

interface WelcomeStepProps {
  onNext: () => void;
}

const WelcomeStep = memo<WelcomeStepProps>(({ onNext }) => {
  const { t, i18n } = useTranslation('onboarding');
  const locale = i18n.language;
  const updateGeneralConfig = useUserStore((s) => s.updateGeneralConfig);

  const handleNext = () => {
    updateGeneralConfig({ telemetry: true });
    onNext();
  };

  const IconAvatar = useCallback(({ icon }: { icon: IconProps['icon'] }) => {
    return (
      <Block
        shadow
        align="center"
        height={32}
        justify="center"
        padding={4}
        variant="outlined"
        width={32}
      >
        <Icon color={cssVar.colorTextDescription} icon={icon} size={16} />
      </Block>
    );
  }, []);

  return (
    <Flexbox align="flex-start" gap={16}>
      <Flexbox
        horizontal
        align="center"
        gap={12}
        style={{ flexShrink: 0, paddingBlock: 12, paddingInlineEnd: 12, paddingInlineStart: 0 }}
      >
        <ProductLogo size={LOGO_SIZE} />
        <Flexbox
          align="center"
          justify="center"
          style={{
            position: 'relative',
            flexShrink: 0,
            height: AI_ICON_SIZE,
            width: AI_ICON_SIZE,
          }}
        >
          <NeuralNetworkLoading size={AI_ICON_SIZE} />
          <Text
            className={styles.aiPulse}
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: '0.02em',
              lineHeight: 1,
              pointerEvents: 'none',
              zIndex: 1,
            }}
          >
            AI
          </Text>
        </Flexbox>
      </Flexbox>
      <Flexbox style={{ marginBottom: 16 }}>
        <Text as={'h1'} fontSize={28} weight={'bold'}>
          <TypewriterEffect
            cursorCharacter={<LoadingDots size={28} variant={'pulse'} />}
            cursorFade={false}
            deletePauseDuration={1000}
            deletingSpeed={32}
            hideCursorWhileTyping={'afterTyping'}
            key={locale}
            pauseDuration={16_000}
            typingSpeed={64}
            sentences={[
              t('telemetry.title', { name: 'ДОиРП ИИ' }),
              t('telemetry.title2'),
              t('telemetry.title3'),
            ]}
          />
        </Text>
        <Text as={'p'}>{t('telemetry.desc')}</Text>
      </Flexbox>
      <Steps
        current={null as any}
        direction={'vertical'}
        items={[
          {
            description: (
              <Text as={'p'} color={cssVar.colorTextSecondary} style={{ marginBottom: 16 }}>
                {t('telemetry.rows.create.desc')}
              </Text>
            ),
            icon: <IconAvatar icon={PencilRulerIcon} />,
            title: (
              <Text as={'h2'} fontSize={16}>
                {t('telemetry.rows.create.title')}
              </Text>
            ),
          },
          {
            description: (
              <Text as={'p'} color={cssVar.colorTextSecondary} style={{ marginBottom: 16 }}>
                {t('telemetry.rows.collaborate.desc')}
              </Text>
            ),
            icon: <IconAvatar icon={HeartHandshakeIcon} />,
            title: (
              <Text as={'h2'} fontSize={16}>
                {t('telemetry.rows.collaborate.title')}
              </Text>
            ),
          },
          {
            description: (
              <Text as={'p'} color={cssVar.colorTextSecondary}>
                {t('telemetry.rows.evolve.desc')}
              </Text>
            ),
            icon: <IconAvatar icon={BrainIcon} />,
            title: (
              <Text as={'h2'} fontSize={16}>
                {t('telemetry.rows.evolve.title')}
              </Text>
            ),
          },
        ]}
      />
      <Button
        size={'large'}
        type="primary"
        style={{
          marginBlock: 8,
          maxWidth: 240,
        }}
        onClick={handleNext}
      >
        {t('telemetry.next')}
      </Button>
    </Flexbox>
  );
});

WelcomeStep.displayName = 'WelcomeStep';

export default WelcomeStep;
