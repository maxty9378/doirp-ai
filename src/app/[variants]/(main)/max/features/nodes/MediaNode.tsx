import { Flexbox } from '@lobehub/ui';
import { Handle, Position } from '@xyflow/react';
import { Card, Image, Input, Select, Typography } from 'antd';
import { useState } from 'react';

import type { MediaNodeData } from './types';

const { Text } = Typography;
const handleStyle = {
  border: '2px solid var(--colorBgContainer)',
  height: 12,
  width: 12,
  zIndex: 3,
} as const;

export const MediaNode = ({ data }: { data: MediaNodeData }) => {
  const [mediaType, setMediaType] = useState<'file' | 'image' | 'video'>(data.mediaType || 'image');
  const [url, setUrl] = useState(data.url || '');
  const [caption, setCaption] = useState(data.caption || '');

  const emitChange = (patch: Partial<MediaNodeData>) => {
    data.onChange?.({
      caption,
      mediaType,
      url,
      ...patch,
    });
  };

  return (
    <Card
      size="small"
      style={{ border: '1px solid var(--colorBorder)', minWidth: 280, overflow: 'visible' }}
      title={<span style={{ color: '#1677ff' }}>Медиа</span>}
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
          value={mediaType}
          options={[
            { label: 'Изображение', value: 'image' },
            { label: 'Видео', value: 'video' },
            { label: 'Файл', value: 'file' },
          ]}
          onChange={(value) => {
            const next = value as 'file' | 'image' | 'video';
            setMediaType(next);
            emitChange({ mediaType: next });
          }}
        />

        <Input
          placeholder="URL медиа"
          value={url}
          onChange={(e) => {
            const next = e.target.value;
            setUrl(next);
            emitChange({ url: next });
          }}
        />

        <Input
          placeholder="Подпись (caption)"
          value={caption}
          onChange={(e) => {
            const next = e.target.value;
            setCaption(next);
            emitChange({ caption: next });
          }}
        />

        {mediaType === 'image' && url && (
          <>
            <Text type="secondary">Предпросмотр:</Text>
            <Image src={url} style={{ borderRadius: 8, maxHeight: 140, objectFit: 'cover' }} />
          </>
        )}
      </Flexbox>
    </Card>
  );
};
