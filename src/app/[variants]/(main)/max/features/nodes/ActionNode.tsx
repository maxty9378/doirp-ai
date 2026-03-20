import { Flexbox } from '@lobehub/ui';
import { Handle, Position } from '@xyflow/react';
import { Card, Select, Typography } from 'antd';
import { useState } from 'react';

import type { ActionNodeData } from './types';

const { Text } = Typography;
const handleStyle = {
  border: '2px solid var(--colorBgContainer)',
  height: 12,
  width: 12,
  zIndex: 3,
} as const;

export const ActionNode = ({ data }: { data: ActionNodeData }) => {
  const [actionType, setActionType] = useState<'human_takeover' | 'typing'>(
    data.actionType || 'typing',
  );

  return (
    <Card
      size="small"
      style={{ border: '1px solid var(--colorBorder)', minWidth: 260, overflow: 'visible' }}
      title={<span style={{ color: '#722ed1' }}>Системное действие</span>}
    >
      <Handle
        className="custom-handle"
        position={Position.Top}
        style={{ ...handleStyle, background: 'var(--colorPrimary)', top: -6 }}
        type="target"
      />
      <Handle
        className="custom-handle"
        id="default-source"
        position={Position.Bottom}
        style={{ ...handleStyle, background: 'var(--colorWarning)', bottom: -6 }}
        type="source"
      />
      <Flexbox gap={8}>
        <Select
          value={actionType}
          options={[
            { label: 'Печатает...', value: 'typing' },
            { label: 'Передать оператору', value: 'human_takeover' },
          ]}
          onChange={(value) => {
            const next = value as 'human_takeover' | 'typing';
            setActionType(next);
            data.onChange?.({ actionType: next });
          }}
        />
        <Text type="secondary">
          {actionType === 'typing'
            ? 'Отправляет индикатор набора текста'
            : 'Останавливает сценарий и помечает диалог для оператора'}
        </Text>
      </Flexbox>
    </Card>
  );
};
