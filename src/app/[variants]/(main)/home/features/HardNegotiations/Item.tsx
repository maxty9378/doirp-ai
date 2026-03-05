import { Avatar, Block, Flexbox, Text } from '@lobehub/ui';
import { cssVar } from 'antd-style';
import { memo } from 'react';

import { type InitialTrainingAgentPreset } from '@/config/initialAgents';
import { DEFAULT_AVATAR } from '@/const/meta';

const TRAINING_CARD_WIDTH = 380;
const TRAINING_CARD_MIN_HEIGHT = 120; // Reduced height because we don't need a banner image here

interface HardNegotiationItemProps {
  loading?: boolean;
  onClick?: () => void;
  preset: InitialTrainingAgentPreset;
}

const HardNegotiationItem = memo<HardNegotiationItemProps>(({ preset, onClick, loading }) => {
  return (
    <Block
      clickable
      flex={'none'}
      justify={'space-between'}
      variant={'filled'}
      width={TRAINING_CARD_WIDTH}
      style={{
        backgroundColor: cssVar.colorFillQuaternary,
        borderRadius: cssVar.borderRadiusLG,
        cursor: loading ? 'wait' : 'pointer',
        minHeight: TRAINING_CARD_MIN_HEIGHT,
        opacity: loading ? 0.7 : 1,
        overflow: 'hidden',
      }}
      onClick={loading ? undefined : onClick}
    >
      <Flexbox horizontal align={'center'} gap={8} paddingBlock={16} paddingInline={16}>
        <Flexbox flex={1} gap={2} style={{ overflow: 'hidden' }}>
          <Text fontSize={15} weight={600}>
            {preset.title}
          </Text>
          <Text color={cssVar.colorTextSecondary} fontSize={13}>
            {preset.description || 'Описание тренажера'}
          </Text>
          <Text fontSize={12} style={{ marginTop: 4 }} type={'secondary'}>
            {loading ? 'Запуск...' : 'Нажмите, чтобы начать'}
          </Text>
        </Flexbox>
        <Avatar
          emojiScaleWithBackground
          avatar={preset.avatar || DEFAULT_AVATAR}
          background={preset.backgroundColor || undefined}
          shape={'square'}
          size={48}
          style={{ flex: 'none' }}
        />
      </Flexbox>
    </Block>
  );
});

export default HardNegotiationItem;
