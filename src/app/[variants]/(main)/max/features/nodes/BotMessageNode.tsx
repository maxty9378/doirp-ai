'use client';

import { ActionIcon, Flexbox } from '@lobehub/ui';
import { Handle, Position } from '@xyflow/react';
import { Button, Card, Image, Input, Select, Switch, Typography } from 'antd';
import { GitBranchPlus, Plus, Rows3, Trash } from 'lucide-react';
import type { ChangeEvent } from 'react';
import { useState } from 'react';

import { type BotMessageNodeData, type FlowNodeData, type InlineButton } from './types';

const { Text } = Typography;
const { TextArea } = Input;

export function BotMessageNode({ data }: { data: BotMessageNodeData }) {
  const [text, setText] = useState(data.text || '');
  const [buttons, setButtons] = useState<InlineButton[]>(data.buttons || []);
  const [contentType, setContentType] = useState<'file' | 'image' | 'text'>(
    data.contentType || 'text',
  );
  const [imageUrl, setImageUrl] = useState(data.imageUrl || '');
  const [fileUrl, setFileUrl] = useState(data.fileUrl || '');
  const [markdown, setMarkdown] = useState(Boolean(data.markdown));

  const emitChange = (patch: Partial<FlowNodeData>) => {
    if (!data.onChange) return;

    data.onChange({
      buttons,
      contentType,
      fileUrl,
      imageUrl,
      markdown,
      text,
      ...patch,
    });
  };

  const handleTextChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value);
    emitChange({ text: e.target.value });
  };

  const addButton = () => {
    const maxRow = buttons.reduce((max, b) => Math.max(max, b.row ?? 0), 0);
    const newButtons = [
      ...buttons,
      { id: Date.now().toString(), label: 'Новая кнопка', row: maxRow },
    ];
    setButtons(newButtons);
    emitChange({ buttons: newButtons });
  };

  const addRow = () => {
    const maxRow = buttons.reduce((max, b) => Math.max(max, b.row ?? 0), 0);
    const newButtons = [...buttons, { id: `${Date.now()}-row`, label: 'Кнопка', row: maxRow + 1 }];
    setButtons(newButtons);
    emitChange({ buttons: newButtons });
  };

  const addNextNode = () => {
    if (data.onAddNext) data.onAddNext();
  };

  const removeButton = (id: string) => {
    const newButtons = buttons.filter((b) => b.id !== id);
    setButtons(newButtons);
    emitChange({ buttons: newButtons });
  };

  const updateButtonLabel = (index: number, label: string) => {
    const newButtons = [...buttons];
    newButtons[index].label = label;
    setButtons(newButtons);
    emitChange({ buttons: newButtons });
  };

  const groupedButtons = buttons.reduce<Record<number, InlineButton[]>>((acc, button) => {
    const row = button.row ?? 0;
    if (!acc[row]) acc[row] = [];
    acc[row].push(button);
    return acc;
  }, {});
  const sortedRows = Object.keys(groupedButtons)
    .map(Number)
    .sort((a, b) => a - b);

  return (
    <Card
      bodyStyle={{ padding: 12 }}
      size="small"
      title={<span style={{ color: '#1677ff' }}>Сообщение</span>}
      style={{
        border: '1px solid var(--colorBorder)',
        boxShadow: 'var(--boxShadowSecondary)',
        minWidth: 280,
        overflow: 'visible',
      }}
    >
      <Handle
        className="custom-handle"
        position={Position.Top}
        type="target"
        style={{
          background: 'var(--colorPrimary)',
          border: '2px solid var(--colorBgContainer)',
          height: 12,
          top: -6,
          width: 12,
          zIndex: 2,
        }}
      />

      <Handle
        className="custom-handle"
        id="default-source"
        position={Position.Bottom}
        type="source"
        style={{
          background: 'var(--colorWarning)',
          border: '2px solid var(--colorBgContainer)',
          bottom: -6,
          height: 12,
          width: 12,
          zIndex: 2,
        }}
      />

      <Flexbox gap={12}>
        <Flexbox gap={4}>
          <Text style={{ fontSize: 12 }} type="secondary">
            Markdown
          </Text>
          <Switch
            checked={markdown}
            onChange={(checked) => {
              setMarkdown(checked);
              emitChange({ markdown: checked });
            }}
          />
        </Flexbox>

        <Flexbox gap={4}>
          <Text style={{ fontSize: 12 }} type="secondary">
            Тип контента
          </Text>
          <Select
            value={contentType}
            options={[
              { label: 'Текст', value: 'text' },
              { label: 'Изображение', value: 'image' },
              { label: 'Файл', value: 'file' },
            ]}
            onChange={(value) => {
              const next = value as 'file' | 'image' | 'text';
              setContentType(next);
              emitChange({ contentType: next });
            }}
          />
        </Flexbox>

        <Flexbox gap={4}>
          <Text style={{ fontSize: 12 }} type="secondary">
            Текст сообщения
          </Text>
          <TextArea
            autoSize={{ maxRows: 6, minRows: 2 }}
            placeholder="Введите текст..."
            value={text}
            onChange={handleTextChange}
          />
        </Flexbox>

        {contentType === 'image' && (
          <Flexbox gap={4}>
            <Text style={{ fontSize: 12 }} type="secondary">
              URL изображения
            </Text>
            <Input
              placeholder="https://..."
              value={imageUrl}
              onChange={(e) => {
                const next = e.target.value;
                setImageUrl(next);
                emitChange({ imageUrl: next });
              }}
            />
            {imageUrl && (
              <Image
                alt="Предпросмотр"
                fallback=""
                src={imageUrl}
                style={{ borderRadius: 8, maxHeight: 140, objectFit: 'cover', width: '100%' }}
              />
            )}
          </Flexbox>
        )}

        {contentType === 'file' && (
          <Flexbox gap={4}>
            <Text style={{ fontSize: 12 }} type="secondary">
              URL файла
            </Text>
            <Input
              placeholder="https://..."
              value={fileUrl}
              onChange={(e) => {
                const next = e.target.value;
                setFileUrl(next);
                emitChange({ fileUrl: next });
              }}
            />
          </Flexbox>
        )}

        <Flexbox gap={8}>
          <Text style={{ fontSize: 12 }} type="secondary">
            Inline клавиатура (как в Telegram)
          </Text>
          {sortedRows.map((rowNumber) => (
            <Flexbox horizontal gap={6} key={`row-${rowNumber}`} style={{ alignItems: 'stretch' }}>
              {groupedButtons[rowNumber].map((btn) => {
                const index = buttons.findIndex((b) => b.id === btn.id);
                return (
                  <Flexbox
                    horizontal
                    align="center"
                    gap={6}
                    key={btn.id}
                    style={{
                      background: 'var(--colorFillSecondary)',
                      border: '1px solid var(--colorBorder)',
                      borderRadius: 8,
                      padding: 6,
                      position: 'relative',
                    }}
                  >
                    <Input
                      placeholder="Текст кнопки"
                      size="small"
                      value={btn.label}
                      onChange={(e) => updateButtonLabel(index, e.target.value)}
                    />
                    <Input
                      placeholder="callback_data"
                      size="small"
                      value={btn.id}
                      onChange={(e) => {
                        const next = [...buttons];
                        next[index].id = e.target.value;
                        setButtons(next);
                        emitChange({ buttons: next });
                      }}
                    />
                    <ActionIcon
                      icon={Trash}
                      size="small"
                      title="Удалить кнопку"
                      onClick={() => removeButton(btn.id)}
                    />
                    <Handle
                      className="custom-handle"
                      id={btn.id}
                      position={Position.Right}
                      type="source"
                      style={{
                        background: 'var(--colorSuccess)',
                        border: '2px solid var(--colorBgContainer)',
                        height: 12,
                        right: -6,
                        width: 12,
                        zIndex: 2,
                      }}
                    />
                  </Flexbox>
                );
              })}
            </Flexbox>
          ))}

          <Flexbox horizontal gap={8}>
            <Button block icon={<Plus size={14} />} size="small" type="dashed" onClick={addButton}>
              Добавить кнопку
            </Button>
            <Button block icon={<Rows3 size={14} />} size="small" type="default" onClick={addRow}>
              Добавить ряд
            </Button>
          </Flexbox>

          <Flexbox
            gap={6}
            padding={8}
            style={{
              background: 'var(--colorFillQuaternary)',
              border: '1px dashed var(--colorBorder)',
              borderRadius: 8,
            }}
          >
            <Text strong style={{ fontSize: 12 }}>
              Предпросмотр клавиатуры
            </Text>
            {sortedRows.length === 0 ? (
              <Text style={{ fontSize: 12 }} type="secondary">
                Кнопки не добавлены
              </Text>
            ) : (
              sortedRows.map((rowNumber) => (
                <Flexbox horizontal gap={6} key={`preview-${rowNumber}`}>
                  {groupedButtons[rowNumber].map((btn) => (
                    <Button key={`preview-btn-${btn.id}`} size="small" type="text">
                      {btn.label || 'Кнопка'}
                    </Button>
                  ))}
                </Flexbox>
              ))
            )}
          </Flexbox>
          <Button
            block
            icon={<GitBranchPlus size={14} />}
            size="small"
            type="default"
            onClick={addNextNode}
          >
            Добавить следующую ноду
          </Button>
        </Flexbox>
      </Flexbox>
    </Card>
  );
}
