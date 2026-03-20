import { Flexbox } from '@lobehub/ui';
import { Handle, Position } from '@xyflow/react';
import { Card, Input, Select } from 'antd';
import { useState } from 'react';

import type { HttpRequestNodeData } from './types';

const handleStyle = {
  border: '2px solid var(--colorBgContainer)',
  height: 12,
  width: 12,
  zIndex: 3,
} as const;

export const HttpRequestNode = ({ data }: { data: HttpRequestNodeData }) => {
  const [method, setMethod] = useState<'GET' | 'POST'>(data.method || 'GET');
  const [url, setUrl] = useState(data.url || '');
  const [headers, setHeaders] = useState(data.headers || '{}');
  const [body, setBody] = useState(data.body || '{}');

  const emitChange = (patch: Partial<HttpRequestNodeData>) => {
    data.onChange?.({
      body,
      headers,
      method,
      url,
      ...patch,
    });
  };

  return (
    <Card
      size="small"
      style={{ border: '1px solid var(--colorBorder)', minWidth: 320, overflow: 'visible' }}
      title={<span style={{ color: '#fa8c16' }}>HTTP Запрос</span>}
    >
      <Handle
        className="custom-handle"
        position={Position.Top}
        style={{ ...handleStyle, background: 'var(--colorPrimary)', top: -6 }}
        type="target"
      />
      <Handle
        className="custom-handle"
        id="success"
        position={Position.Bottom}
        style={{ ...handleStyle, background: 'var(--colorSuccess)', bottom: -6, left: '30%' }}
        type="source"
      />
      <Handle
        className="custom-handle"
        id="error"
        position={Position.Bottom}
        style={{ ...handleStyle, background: 'var(--colorError)', bottom: -6, left: '70%' }}
        type="source"
      />

      <Flexbox gap={8}>
        <Select
          value={method}
          options={[
            { label: 'GET', value: 'GET' },
            { label: 'POST', value: 'POST' },
          ]}
          onChange={(next) => {
            const value = next as 'GET' | 'POST';
            setMethod(value);
            emitChange({ method: value });
          }}
        />
        <Input
          placeholder="URL запроса"
          value={url}
          onChange={(e) => {
            const next = e.target.value;
            setUrl(next);
            emitChange({ url: next });
          }}
        />
        <Input.TextArea
          autoSize={{ maxRows: 4, minRows: 2 }}
          placeholder='Headers JSON, например {"Authorization":"Bearer ..."}'
          value={headers}
          onChange={(e) => {
            const next = e.target.value;
            setHeaders(next);
            emitChange({ headers: next });
          }}
        />
        <Input.TextArea
          autoSize={{ maxRows: 4, minRows: 2 }}
          placeholder='Body JSON, например {"name":"MAX"}'
          value={body}
          onChange={(e) => {
            const next = e.target.value;
            setBody(next);
            emitChange({ body: next });
          }}
        />
      </Flexbox>
    </Card>
  );
};
