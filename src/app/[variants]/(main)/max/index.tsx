'use client';

import '@xyflow/react/dist/style.css';

import { Flexbox } from '@lobehub/ui';
import type { Connection, Edge, EdgeMouseHandler, Node, NodeMouseHandler } from '@xyflow/react';
import {
  addEdge,
  Background,
  BackgroundVariant,
  ConnectionMode,
  Controls,
  MarkerType,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
} from '@xyflow/react';
import { Button, Card, Form, Input, message as antdMessage, Tabs, Typography } from 'antd';
import { Bot, Play, Save } from 'lucide-react';
import { memo, useCallback, useEffect, useRef, useState } from 'react';

import PageTitle from '@/components/PageTitle';
import NavHeader from '@/features/NavHeader';

import { ActionNode } from './features/nodes/ActionNode';
import { BotMessageNode } from './features/nodes/BotMessageNode';
import { HttpRequestNode } from './features/nodes/HttpRequestNode';
import { InputNode } from './features/nodes/InputNode';
import { LogicNode } from './features/nodes/LogicNode';
import { MediaNode } from './features/nodes/MediaNode';
import type { FlowNodeData, MaxNodeType } from './features/nodes/types';
import Simulator from './features/Simulator';

const { Title, Text } = Typography;

const getApiUrl = (path: string) => {
  if (typeof window === 'undefined') return path;
  const fallbackBase = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3010';
  const base = window.location.origin?.startsWith('http') ? window.location.origin : fallbackBase;
  return `${base}${path}`;
};

const nodeTypes = {
  actionNode: ActionNode,
  botMessage: BotMessageNode,
  httpRequestNode: HttpRequestNode,
  inputNode: InputNode,
  logicNode: LogicNode,
  mediaNode: MediaNode,
};

type BotNodePatch = Partial<FlowNodeData>;

const createNodeData = (kind: MaxNodeType): FlowNodeData => {
  if (kind === 'mediaNode') return { caption: '', kind, mediaType: 'image', url: '' };
  if (kind === 'inputNode') return { kind, prompt: 'Введите значение', variableName: 'user_name' };
  if (kind === 'logicNode') return { kind, operator: 'eq', value: '', variableName: 'user_name' };
  if (kind === 'httpRequestNode')
    return { body: '{}', headers: '{}', kind, method: 'GET', url: '' };
  if (kind === 'actionNode') return { actionType: 'typing', kind };

  return {
    buttons: [{ id: 'btn_1', label: 'Далее' }],
    contentType: 'text',
    fileUrl: '',
    imageUrl: '',
    kind: 'botMessage',
    markdown: false,
    text: 'Новое сообщение',
  };
};

const initialNodes: Node[] = [
  {
    data: { label: 'Start (Trigger)' },
    id: 'start',
    position: { x: 250, y: 50 },
    style: {
      background: 'var(--colorBgContainer)',
      border: '2px solid var(--colorBorder)',
      borderRadius: '8px',
      color: 'var(--colorText)',
      fontSize: 14,
      fontWeight: 'bold',
      padding: '8px 16px',
    },
    type: 'input',
  },
  {
    data: {
      ...createNodeData('botMessage'),
      buttons: [{ id: 'btn_1', label: 'Поехали' }],
      text: 'Привет! Добро пожаловать.',
    },
    id: '1',
    position: { x: 250, y: 150 },
    type: 'botMessage',
  },
];

const initialEdges: Edge[] = [
  {
    animated: true,
    id: 'e1-2',
    markerEnd: { color: 'var(--colorTextSecondary)', type: MarkerType.ArrowClosed },
    source: 'start',
    style: { stroke: 'var(--colorTextSecondary)' },
    target: '1',
    type: 'smoothstep',
  },
];

const ensureStartEdge = (nodes: Node[], edges: Edge[]): Edge[] => {
  const hasStartNode = nodes.some((n) => n.id === 'start');
  if (!hasStartNode) return edges;

  const nodeIds = new Set(nodes.map((n) => n.id));
  const startOutgoing = edges.filter((e) => e.source === 'start');
  const hasValidStartOutgoing = startOutgoing.some((e) => nodeIds.has(e.target));
  if (hasValidStartOutgoing) return edges;

  const firstMessageNode = nodes.find((n) => n.type === 'botMessage');
  if (!firstMessageNode) return edges;

  const edgesWithoutBrokenStart = edges.filter((e) => e.source !== 'start');

  return [
    ...edgesWithoutBrokenStart,
    {
      animated: true,
      id: `e-start-${firstMessageNode.id}`,
      markerEnd: { color: 'var(--colorTextSecondary)', type: MarkerType.ArrowClosed },
      source: 'start',
      style: { stroke: 'var(--colorTextSecondary)' },
      target: firstMessageNode.id,
      type: 'smoothstep',
    },
  ];
};

const FlowCanvas = memo(() => {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [messageApi, contextHolder] = antdMessage.useMessage();
  const [isSimulatorOpen, setIsSimulatorOpen] = useState(false);
  const [isFlowReady, setIsFlowReady] = useState(false);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nodesRef = useRef<Node[]>(nodes);
  const hasLoadedFlowRef = useRef(false);

  useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);

  const updateBotMessageNode = useCallback(
    (nodeId: string, patch: BotNodePatch) => {
      setNodes((prev) =>
        prev.map((n) => (n.id === nodeId ? { ...n, data: { ...n.data, ...patch } } : n)),
      );
    },
    [setNodes],
  );

  const createCanvasNode = useCallback(
    (kind: MaxNodeType, position?: { x: number; y: number }, id?: string): Node => {
      const nodeId = id || Date.now().toString();
      return {
        data: {
          ...createNodeData(kind),
          onAddNext: undefined,
          onChange: (patch: BotNodePatch) => updateBotMessageNode(nodeId, patch),
        },
        id: nodeId,
        position: position || { x: Math.random() * 200 + 100, y: Math.random() * 200 + 100 },
        type: kind,
      };
    },
    [updateBotMessageNode],
  );

  const addConnectedNextNode = useCallback(
    (sourceNodeId: string) => {
      const sourceNode = nodesRef.current.find((n) => n.id === sourceNodeId);
      const id = Date.now().toString();
      const newNode = createCanvasNode(
        'botMessage',
        {
          x: (sourceNode?.position.x ?? 200) + 20,
          y: (sourceNode?.position.y ?? 200) + 220,
        },
        id,
      );
      newNode.data = {
        ...newNode.data,
        onAddNext: () => addConnectedNextNode(id),
      };

      setNodes((prev) => [...prev, newNode]);
      setEdges((prev) =>
        addEdge(
          {
            animated: true,
            id: `e-${sourceNodeId}-${id}`,
            markerEnd: { color: 'var(--colorTextSecondary)', type: MarkerType.ArrowClosed },
            source: sourceNodeId,
            sourceHandle: 'default-source',
            target: id,
            type: 'smoothstep',
          },
          prev,
        ),
      );
    },
    [createCanvasNode, setEdges, setNodes],
  );

  const withNodeHandlers = useCallback(
    (inputNodes: Node[]) =>
      inputNodes.map((n) => {
        if (
          n.type !== 'botMessage' &&
          n.type !== 'mediaNode' &&
          n.type !== 'inputNode' &&
          n.type !== 'logicNode' &&
          n.type !== 'httpRequestNode' &&
          n.type !== 'actionNode'
        )
          return n;
        return {
          ...n,
          data: {
            ...n.data,
            onAddNext: n.type === 'botMessage' ? () => addConnectedNextNode(n.id) : undefined,
            onChange: (patch: BotNodePatch) => updateBotMessageNode(n.id, patch),
          },
        };
      }),
    [addConnectedNextNode, updateBotMessageNode],
  );

  useEffect(() => {
    if (hasLoadedFlowRef.current) return;
    hasLoadedFlowRef.current = true;

    const loadFlow = async () => {
      try {
        const response = await fetch(getApiUrl('/api/max/flow/save'));
        const data = await response.json();
        const flow = data?.flow;

        if (flow?.nodes && Array.isArray(flow.nodes)) {
          const normalizedNodes = withNodeHandlers(flow.nodes);
          setNodes(normalizedNodes);

          const normalizedEdges = ensureStartEdge(
            normalizedNodes,
            flow?.edges && Array.isArray(flow.edges) ? flow.edges : [],
          );
          setEdges(normalizedEdges);
        } else {
          setNodes(withNodeHandlers(initialNodes));
          setEdges(initialEdges);
        }
        setIsFlowReady(true);
      } catch (error) {
        console.error('Load flow error:', error);
        setNodes(withNodeHandlers(initialNodes));
        setEdges(initialEdges);
        setIsFlowReady(true);
      }
    };

    void loadFlow();
  }, [setEdges, setNodes, withNodeHandlers]);

  const onConnect = useCallback(
    (params: Connection | Edge) =>
      setEdges((eds) =>
        addEdge(
          {
            ...params,
            animated: true,
            markerEnd: { color: 'var(--colorTextSecondary)', type: MarkerType.ArrowClosed },
            type: 'smoothstep',
          },
          eds,
        ),
      ),
    [setEdges],
  );

  const addMessageNode = () => {
    const id = Date.now().toString();
    const node = createCanvasNode('botMessage', undefined, id);
    node.data = {
      ...node.data,
      onAddNext: () => addConnectedNextNode(id),
    };
    setNodes((nds) => [...nds, node]);
  };

  const addTypedNode = (kind: MaxNodeType) => setNodes((nds) => [...nds, createCanvasNode(kind)]);

  const selectedNode = nodes.find((n) => n.id === selectedNodeId) || null;
  const updateSelectedNodeData = (patch: BotNodePatch) => {
    if (!selectedNodeId) return;
    updateBotMessageNode(selectedNodeId, patch);
  };

  const onNodeClick: NodeMouseHandler = useCallback((_, node) => {
    setSelectedNodeId(node.id);
  }, []);

  const onEdgeClick: EdgeMouseHandler = useCallback(
    (event, edge) => {
      // Безопасное удаление: только по Alt/Option + клик
      if (!event.altKey) {
        messageApi.info('Чтобы удалить связь, зажмите Alt и кликните по линии');
        return;
      }
      setEdges((prev) => prev.filter((e) => e.id !== edge.id));
      messageApi.success('Связь удалена');
    },
    [messageApi, setEdges],
  );

  const persistFlow = async (silent = false) => {
    try {
      const response = await fetch(getApiUrl('/api/max/flow/save'), {
        body: JSON.stringify({ edges, nodes }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      });
      if (response.ok) {
        if (!silent) messageApi.success('Схема бота успешно сохранена на сервере!');
      } else {
        if (!silent) messageApi.error('Ошибка при сохранении схемы.');
      }
    } catch (e) {
      console.error('Save error', e);
      if (!silent) messageApi.error('Ошибка сети при сохранении схемы.');
    }
  };

  const saveFlow = async () => persistFlow(false);

  useEffect(() => {
    if (!isFlowReady) return;

    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    autosaveTimer.current = setTimeout(() => {
      void persistFlow(true);
    }, 600);

    return () => {
      if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    };
  }, [edges, isFlowReady, nodes]);

  return (
    <>
      {contextHolder}
      <Flexbox horizontal height="100%" width="100%">
        {/* Sidebar */}
        <Flexbox
          gap={24}
          padding={16}
          style={{
            background: 'var(--colorBgContainer)',
            borderRight: '1px solid var(--colorBorder)',
            width: 280,
            zIndex: 10,
          }}
        >
          <Title level={4} style={{ margin: 0 }}>
            Конструктор сценария
          </Title>

          <Flexbox gap={12}>
            <Text style={{ fontSize: 12, textTransform: 'uppercase' }} type="secondary">
              Сцены
            </Text>
            <Card size="small">
              <Flexbox gap={4}>
                {nodes.map((n) => (
                  <Button
                    key={`scene-${n.id}`}
                    size="small"
                    style={{ justifyContent: 'flex-start' }}
                    type={selectedNodeId === n.id ? 'primary' : 'text'}
                    onClick={() => setSelectedNodeId(n.id)}
                  >
                    {n.type === 'botMessage' ? 'Сообщение' : n.type} #{n.id}
                  </Button>
                ))}
              </Flexbox>
            </Card>
          </Flexbox>

          <Flexbox gap={12}>
            <Text style={{ fontSize: 12, textTransform: 'uppercase' }} type="secondary">
              Блоки
            </Text>

            <Button
              block
              icon={<Bot size={16} />}
              size="large"
              style={{ justifyContent: 'flex-start', textAlign: 'left' }}
              onClick={addMessageNode}
            >
              <Flexbox>
                <Text strong>Сообщение</Text>
                <Text style={{ fontSize: 12 }} type="secondary">
                  Текст + кнопки + медиа
                </Text>
              </Flexbox>
            </Button>
            <Button block size="middle" onClick={() => addTypedNode('mediaNode')}>
              Медиа
            </Button>
            <Button block size="middle" onClick={() => addTypedNode('inputNode')}>
              Ввод данных
            </Button>
            <Button block size="middle" onClick={() => addTypedNode('logicNode')}>
              Условие If/Else
            </Button>
            <Button block size="middle" onClick={() => addTypedNode('httpRequestNode')}>
              HTTP Запрос
            </Button>
            <Button block size="middle" onClick={() => addTypedNode('actionNode')}>
              Действие
            </Button>
          </Flexbox>

          <Flexbox gap={12} style={{ marginTop: 'auto' }}>
            <Button
              block
              icon={<Play size={16} />}
              size="large"
              type="default"
              onClick={() => setIsSimulatorOpen(true)}
            >
              Запустить тест
            </Button>
            <Button block icon={<Save size={16} />} size="large" type="primary" onClick={saveFlow}>
              Сохранить схему
            </Button>
          </Flexbox>
        </Flexbox>

        {/* Canvas */}
        <Flexbox flex={1} height="100%" style={{ position: 'relative' }}>
          <style global jsx>{`
            .react-flow__handle {
              background: #1677ff !important;
              border: 2px solid #ffffff !important;
              border-radius: 999px !important;
              height: 16px !important;
              opacity: 1 !important;
              pointer-events: all !important;
              visibility: visible !important;
              width: 16px !important;
              z-index: 999 !important;
              box-shadow: 0 0 0 2px rgba(22, 119, 255, 0.25) !important;
            }
            .react-flow__handle.custom-handle {
              opacity: 1 !important;
              visibility: visible !important;
            }
          `}</style>
          <ReactFlow
            fitView
            connectionMode={ConnectionMode.Loose}
            edges={edges}
            nodeTypes={nodeTypes}
            nodes={nodes}
            onConnect={onConnect}
            onEdgeClick={onEdgeClick}
            onEdgesChange={onEdgesChange}
            onNodeClick={onNodeClick}
            onNodesChange={onNodesChange}
          >
            <Controls style={{ background: 'var(--colorBgContainer)' }} />
            <MiniMap pannable zoomable style={{ background: 'var(--colorBgContainer)' }} />
            <Background
              color="var(--colorTextQuaternary)"
              gap={16}
              size={1}
              variant={BackgroundVariant.Dots}
            />
          </ReactFlow>
        </Flexbox>

        {/* Inspector */}
        <Flexbox
          gap={12}
          padding={12}
          style={{
            background: 'var(--colorBgContainer)',
            borderLeft: '1px solid var(--colorBorder)',
            width: 320,
          }}
        >
          <Text style={{ fontSize: 12, textTransform: 'uppercase' }} type="secondary">
            Инспектор блока
          </Text>
          {!selectedNode ? (
            <Card size="small">
              <Text type="secondary">Выберите блок на холсте</Text>
            </Card>
          ) : (
            <Card size="small" title={`${selectedNode.type} #${selectedNode.id}`}>
              <Flexbox gap={8}>
                <Text type="secondary">Название / текст</Text>
                <Input
                  value={String((selectedNode.data as Record<string, unknown>)?.text || '')}
                  onChange={(e) => updateSelectedNodeData({ text: e.target.value })}
                />
                {selectedNode.type === 'inputNode' && (
                  <>
                    <Text type="secondary">Переменная</Text>
                    <Input
                      value={String(
                        (selectedNode.data as Record<string, unknown>)?.variableName || '',
                      )}
                      onChange={(e) => updateSelectedNodeData({ variableName: e.target.value })}
                    />
                  </>
                )}
                {selectedNode.type === 'logicNode' && (
                  <>
                    <Text type="secondary">Значение условия</Text>
                    <Input
                      value={String((selectedNode.data as Record<string, unknown>)?.value || '')}
                      onChange={(e) => updateSelectedNodeData({ value: e.target.value })}
                    />
                  </>
                )}
                {selectedNode.type === 'httpRequestNode' && (
                  <>
                    <Text type="secondary">URL запроса</Text>
                    <Input
                      value={String((selectedNode.data as Record<string, unknown>)?.url || '')}
                      onChange={(e) => updateSelectedNodeData({ url: e.target.value })}
                    />
                  </>
                )}
              </Flexbox>
            </Card>
          )}
        </Flexbox>

        {/* Simulator Sidebar */}
        {isSimulatorOpen && (
          <Simulator open={isSimulatorOpen} onClose={() => setIsSimulatorOpen(false)} />
        )}
      </Flexbox>
    </>
  );
});

const SettingsPanel = memo(() => {
  const [form] = Form.useForm();
  const [messageApi, contextHolder] = antdMessage.useMessage();
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [loadingConfig, setLoadingConfig] = useState(false);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [logsText, setLogsText] = useState('');
  const [webhookUrl, setWebhookUrl] = useState('/api/max/webhook');

  useEffect(() => {
    if (typeof window === 'undefined') return;
    setWebhookUrl(`${window.location.origin}/api/max/webhook`);
  }, []);

  useEffect(() => {
    const loadConfig = async () => {
      setLoadingConfig(true);
      try {
        const response = await fetch(getApiUrl('/api/max/config'));
        const data = await response.json();
        if (data?.status === 'ok' && data?.config) {
          form.setFieldsValue({
            apiToken: data.config.apiToken || '',
            baseUrl: data.config.baseUrl || 'https://api.max-messenger.ru',
            botName: data.config.botName || '',
          });
        }
      } catch (error) {
        console.error('Load config error:', error);
      } finally {
        setLoadingConfig(false);
      }
    };

    const loadLogs = async () => {
      setLoadingLogs(true);
      try {
        const response = await fetch(getApiUrl('/api/max/logs'));
        const data = await response.json();
        if (data?.status === 'ok' && Array.isArray(data.logs)) {
          const text = data.logs
            .map((l: { level: string; message: string; timestamp: string }) => {
              return `[${l.timestamp}] [${l.level.toUpperCase()}] ${l.message}`;
            })
            .join('\n');
          setLogsText(text);
        } else {
          setLogsText('');
        }
      } catch (error) {
        console.error('Load logs error:', error);
        setLogsText('');
      } finally {
        setLoadingLogs(false);
      }
    };

    void loadConfig();
    void loadLogs();
  }, [form]);

  const saveConfig = async (values: { apiToken: string; baseUrl: string; botName: string }) => {
    setSaving(true);
    try {
      const response = await fetch(getApiUrl('/api/max/config'), {
        body: JSON.stringify({ ...values, webhookUrl }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      });

      if (!response.ok) {
        messageApi.error('Не удалось сохранить настройки');
        return;
      }

      messageApi.success('Настройки MAX успешно сохранены');
    } catch (error) {
      console.error('Save config error:', error);
      messageApi.error('Ошибка сети при сохранении настроек');
    } finally {
      setSaving(false);
    }
  };

  const testConnection = async () => {
    const values = form.getFieldsValue(['apiToken', 'baseUrl']) as {
      apiToken?: string;
      baseUrl?: string;
    };

    if (!values.apiToken || !values.baseUrl) {
      messageApi.error('Введите API Token и Base URL перед проверкой');
      return;
    }

    setTesting(true);
    try {
      const response = await fetch(getApiUrl('/api/max/config/test'), {
        body: JSON.stringify({ apiToken: values.apiToken, baseUrl: values.baseUrl }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      });
      const data = await response.json();
      if (response.ok && data?.status === 'ok') {
        messageApi.success('Успех: соединение с MAX API установлено');
      } else {
        messageApi.error(`Ошибка: ${data?.message || 'не удалось подключиться'}`);
      }
    } catch (error) {
      console.error('Test connection error:', error);
      messageApi.error('Ошибка сети при проверке соединения');
    } finally {
      setTesting(false);
    }
  };

  return (
    <Flexbox gap={16} padding={16}>
      {contextHolder}
      <Card
        style={{ background: 'var(--colorBgContainer)', maxWidth: 720, width: '100%' }}
        title="Настройки интеграции MAX"
      >
        <Form
          form={form}
          initialValues={{ baseUrl: 'https://api.max-messenger.ru' }}
          layout="vertical"
          onFinish={saveConfig}
        >
          <Form.Item
            label="Название бота"
            name="botName"
            rules={[{ message: 'Введите название бота', required: true }]}
          >
            <Input placeholder="Например: MAX Assistant" />
          </Form.Item>

          <Form.Item
            label="API Token"
            name="apiToken"
            rules={[{ message: 'Введите API токен', required: true }]}
          >
            <Input.Password placeholder="Введите токен МАКС API" />
          </Form.Item>

          <Form.Item
            label="Base URL сервера МАКС"
            name="baseUrl"
            rules={[{ message: 'Введите Base URL', required: true }]}
          >
            <Input placeholder="https://api.max-messenger.ru" />
          </Form.Item>

          <Form.Item label="Webhook URL (только чтение)">
            <Input readOnly value={webhookUrl} />
          </Form.Item>

          <Form.Item style={{ marginBottom: 0 }}>
            <Flexbox horizontal gap={8}>
              <Button htmlType="submit" loading={saving || loadingConfig} type="primary">
                Сохранить настройки
              </Button>
              <Button loading={testing} onClick={testConnection}>
                Проверить соединение
              </Button>
            </Flexbox>
          </Form.Item>

          <Form.Item label="Последние логи вебхука" style={{ marginBottom: 0 }}>
            <Input.TextArea
              readOnly
              autoSize={{ maxRows: 10, minRows: 6 }}
              placeholder={loadingLogs ? 'Загрузка логов...' : 'Логи пока отсутствуют'}
              value={logsText}
            />
          </Form.Item>
        </Form>
      </Card>
    </Flexbox>
  );
});

const MaxPage = memo(() => {
  const [tab, setTab] = useState<'editor' | 'settings'>('editor');

  return (
    <>
      <PageTitle title="MAX Builder" />
      <NavHeader />
      <Flexbox height="100%" width="100%">
        <Flexbox gap={0} style={{ height: '100%', overflow: 'hidden' }} width="100%">
          <Tabs
            activeKey={tab}
            style={{ paddingInline: 16, paddingTop: 8 }}
            items={[
              { key: 'editor', label: 'Редактор' },
              { key: 'settings', label: 'Настройки' },
            ]}
            onChange={(key) => setTab(key as 'editor' | 'settings')}
          />

          <Flexbox flex={1} style={{ minHeight: 0 }}>
            {tab === 'editor' ? (
              <ReactFlowProvider>
                <FlowCanvas />
              </ReactFlowProvider>
            ) : (
              <SettingsPanel />
            )}
          </Flexbox>
        </Flexbox>
      </Flexbox>
    </>
  );
});

MaxPage.displayName = 'MaxPage';

export default MaxPage;
