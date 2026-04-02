'use client';

import { Avatar, Block, Flexbox, Text } from '@lobehub/ui';
import { cssVar } from 'antd-style';
import { memo } from 'react';

const TRAINING_CARD_WIDTH = 380;
const TRAINING_CARD_MIN_HEIGHT = 360;
const DEFAULT_AVATAR = '/images/voice-call/trainer-ai-mic.svg';
const BANNER_FALLBACK = '/images/voice-call/trainer-ai-mic.svg';

export interface TrainingScenarioFromApi {
  avatarUrl?: string | null;
  bannerUrl?: string | null;
  description?: string | null;
  key: string;
  title: string;
}

interface TrainingScenarioCardProps {
  fullWidth?: boolean;
  loading?: boolean;
  onClick?: () => void;
  onWarmUp?: () => void;
  scenario: TrainingScenarioFromApi;
}

const TrainingScenarioCard = memo<TrainingScenarioCardProps>(
  ({ scenario, onClick, loading, fullWidth, onWarmUp }) => {
    const bannerUrl = scenario.bannerUrl?.trim() || null;
    const avatarUrl = scenario.avatarUrl?.trim() || null;
    const title = scenario.title || 'Тренажер';
    const description = scenario.description || 'Голосовой тренажер. Нажмите, чтобы начать.';

    return (
      <Block
        clickable
        flex={'none'}
        justify={'flex-start'}
        variant={'filled'}
        width={fullWidth ? '100%' : TRAINING_CARD_WIDTH}
        style={{
          backgroundColor: cssVar.colorFillQuaternary,
          borderRadius: cssVar.borderRadiusLG,
          cursor: loading ? 'wait' : 'pointer',
          minHeight: fullWidth ? 300 : TRAINING_CARD_MIN_HEIGHT,
          opacity: loading ? 0.7 : 1,
          overflow: 'hidden',
        }}
        onClick={loading ? undefined : onClick}
        onFocus={onWarmUp}
        onMouseEnter={onWarmUp}
        onTouchStart={onWarmUp}
      >
        <div
          style={{
            aspectRatio: '16 / 9',
            backgroundImage: bannerUrl ? `url(${bannerUrl})` : `url(${BANNER_FALLBACK})`,
            backgroundPosition: 'center, center',
            backgroundRepeat: 'no-repeat, no-repeat',
            backgroundSize: bannerUrl ? 'cover, cover' : 'cover, 88px',
            borderBottom: `1px solid ${cssVar.colorBorderSecondary}`,
            position: 'relative',
            width: '100%',
          }}
        />
        <Flexbox
          horizontal
          align={'stretch'}
          flex={1}
          gap={10}
          paddingBlock={10}
          paddingInline={12}
        >
          <Flexbox flex={1} justify={'space-between'} style={{ minWidth: 0 }}>
            <Flexbox gap={3} style={{ minWidth: 0 }}>
              <Text
                fontSize={14}
                style={{ lineHeight: '20px', minHeight: 20 }}
                title={title}
                weight={600}
              >
                {title}
              </Text>
              <Text
                color={cssVar.colorTextSecondary}
                fontSize={13}
                title={description}
                style={{
                  lineHeight: '18px',
                  minHeight: 72,
                  whiteSpace: 'pre-wrap',
                }}
              >
                {description}
              </Text>
            </Flexbox>
            <Text
              fontSize={12}
              style={{ lineHeight: '16px', marginTop: 8, minHeight: 16 }}
              type={'secondary'}
            >
              {loading ? 'Запуск...' : 'Нажмите, чтобы начать'}
            </Text>
          </Flexbox>
          <Avatar
            avatar={avatarUrl || DEFAULT_AVATAR}
            size={40}
            style={{ alignSelf: 'flex-start', flex: 'none', marginTop: 2 }}
          />
        </Flexbox>
      </Block>
    );
  },
);

TrainingScenarioCard.displayName = 'TrainingScenarioCard';

export default TrainingScenarioCard;
