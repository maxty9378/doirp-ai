import { Flexbox } from '@lobehub/ui';
import { Handle, Position } from '@xyflow/react';
import { Card, Input, Select } from 'antd';
import { useState } from 'react';

import type { LogicNodeData } from './types';

const handleStyle = {
  border: '2px solid var(--colorBgContainer)',
  height: 12,
  width: 12,
  zIndex: 3,
} as const;

export const LogicNode = ({ data }: { data: LogicNodeData }) => {
  const [variableName, setVariableName] = useState(data.variableName || 'user_name');
  const [operator, setOperator] = useState<'contains' | 'eq' | 'neq'>(data.operator || 'eq');
  const [value, setValue] = useState(data.value || '');

  const emitChange = (patch: Partial<LogicNodeData>) => {
    data.onChange?.({
      operator,
      value,
      variableName,
      ...patch,
    });
  };

  return (
    <Card
      size="small"
      style={{ border: '1px solid var(--colorBorder)', minWidth: 300, overflow: 'visible' }}
      title={<span style={{ color: '#52c41a' }}>Логика If/Else</span>}
    >
      <Handle
        className="custom-handle"
        position={Position.Top}
        style={{ ...handleStyle, background: 'var(--colorPrimary)', top: -6 }}
        type="target"
      />
      <Handle
        className="custom-handle"
        id="if-true"
        position={Position.Bottom}
        style={{ ...handleStyle, background: 'var(--colorSuccess)', bottom: -6, left: '30%' }}
        type="source"
      />
      <Handle
        className="custom-handle"
        id="if-false"
        position={Position.Bottom}
        style={{ ...handleStyle, background: 'var(--colorError)', bottom: -6, left: '70%' }}
        type="source"
      />

      <Flexbox gap={8}>
        <Input
          placeholder="Переменная"
          value={variableName}
          onChange={(e) => {
            const next = e.target.value;
            setVariableName(next);
            emitChange({ variableName: next });
          }}
        />
        <Select
          value={operator}
          options={[
            { label: 'равно', value: 'eq' },
            { label: 'не равно', value: 'neq' },
            { label: 'содержит', value: 'contains' },
          ]}
          onChange={(next) => {
            const op = next as 'contains' | 'eq' | 'neq';
            setOperator(op);
            emitChange({ operator: op });
          }}
        />
        <Input
          placeholder="Значение для сравнения"
          value={value}
          onChange={(e) => {
            const next = e.target.value;
            setValue(next);
            emitChange({ value: next });
          }}
        />
      </Flexbox>
    </Card>
  );
};
