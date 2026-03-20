import { Flexbox } from '@lobehub/ui';
import { Handle, Position } from '@xyflow/react';
import { Card, Input } from 'antd';
import { useState } from 'react';

import type { InputNodeData } from './types';

const handleStyle = {
  border: '2px solid var(--colorBgContainer)',
  height: 12,
  width: 12,
  zIndex: 3,
} as const;

export const InputNode = ({ data }: { data: InputNodeData }) => {
  const [prompt, setPrompt] = useState(data.prompt || 'Введите значение');
  const [variableName, setVariableName] = useState(data.variableName || 'user_name');

  const emitChange = (patch: Partial<InputNodeData>) => {
    data.onChange?.({
      prompt,
      variableName,
      ...patch,
    });
  };

  return (
    <Card
      size="small"
      style={{ border: '1px solid var(--colorBorder)', minWidth: 280, overflow: 'visible' }}
      title={<span style={{ color: '#13c2c2' }}>Ввод данных</span>}
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
        <Input
          placeholder="Сообщение пользователю"
          value={prompt}
          onChange={(e) => {
            const next = e.target.value;
            setPrompt(next);
            emitChange({ prompt: next });
          }}
        />
        <Input
          placeholder="Сохранить в переменную"
          value={variableName}
          onChange={(e) => {
            const next = e.target.value;
            setVariableName(next);
            emitChange({ variableName: next });
          }}
        />
      </Flexbox>
    </Card>
  );
};
