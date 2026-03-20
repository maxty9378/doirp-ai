import { promises as fs } from 'node:fs';
import path from 'node:path';

import { NextResponse } from 'next/server';

import { MaxAPI } from '../lib/maxClient';

type WebhookLog = {
  id: string;
  details?: string;
  level: 'info' | 'error';
  message: string;
  timestamp: string;
};

const appendWebhookLog = async (entry: Omit<WebhookLog, 'id' | 'timestamp'>) => {
  try {
    const logsPath = path.join(process.cwd(), 'logs.json');
    let logs: WebhookLog[] = [];
    try {
      const raw = await fs.readFile(logsPath, 'utf8');
      logs = JSON.parse(raw) as WebhookLog[];
    } catch {
      logs = [];
    }

    logs.push({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      details: entry.details,
      level: entry.level,
      message: entry.message,
      timestamp: new Date().toISOString(),
    });

    const lastFive = logs.slice(-5);
    await fs.writeFile(logsPath, JSON.stringify(lastFive, null, 2), 'utf-8');
  } catch (error) {
    console.error('Не удалось записать webhook-лог:', error);
  }
};

interface FlowNodeData {
  actionType?: 'typing' | 'human_takeover';
  body?: string;
  buttons?: Array<{ id: string; label: string }>;
  caption?: string;
  contentType?: 'file' | 'image' | 'text';
  fileUrl?: string;
  headers?: string;
  imageUrl?: string;
  kind?: string;
  markdown?: boolean;
  mediaType?: 'file' | 'image' | 'video';
  method?: 'GET' | 'POST';
  operator?: 'contains' | 'eq' | 'neq';
  prompt?: string;
  text?: string;
  url?: string;
  value?: string;
  variableName?: string;
}

interface FlowNode {
  data?: FlowNodeData;
  id: string;
  type?: string;
}

interface FlowEdge {
  source: string;
  sourceHandle?: string;
  target: string;
}

interface FlowData {
  edges: FlowEdge[];
  nodes: FlowNode[];
}

interface IncomingContext {
  chatId?: number;
  currentNodeId: string;
  eventType: string;
  isCallback: boolean;
  text: string;
  userId: number;
}

interface SessionState {
  currentNodeId?: string;
  variables: Record<string, string>;
  waitingInputNodeId?: string;
}

interface ExecutionResult {
  buttons?: Array<{ id: string; label: string }>;
  caption?: string;
  contentType?: 'file' | 'image' | 'text';
  fileUrl?: string;
  imageUrl?: string;
  markdown?: boolean;
  nodeId?: string;
  text?: string;
}

const readFlow = async (): Promise<FlowData | null> => {
  try {
    const filePath = path.join(process.cwd(), 'flow.json');
    const fileContent = await fs.readFile(filePath, 'utf8');
    const parsed = JSON.parse(fileContent) as Partial<FlowData>;
    return {
      edges: Array.isArray(parsed.edges) ? parsed.edges : [],
      nodes: Array.isArray(parsed.nodes) ? parsed.nodes : [],
    };
  } catch {
    return null;
  }
};

const statePath = path.join(process.cwd(), 'max-state.json');

const readState = async (): Promise<Record<string, SessionState>> => {
  try {
    const raw = await fs.readFile(statePath, 'utf8');
    return JSON.parse(raw) as Record<string, SessionState>;
  } catch {
    return {};
  }
};

const writeState = async (value: Record<string, SessionState>) => {
  await fs.writeFile(statePath, JSON.stringify(value, null, 2), 'utf-8');
};

const getValueAtPath = (input: unknown, pathString: string) =>
  pathString.split('.').reduce<unknown>((acc, key) => {
    if (acc && typeof acc === 'object' && key in (acc as Record<string, unknown>)) {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, input);

const pickFirst = (input: unknown, paths: string[]) => {
  for (const pathKey of paths) {
    const value = getValueAtPath(input, pathKey);
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return undefined;
};

const toNumber = (value: unknown) => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
};

const parseIncomingContext = (payload: unknown): IncomingContext => {
  const userId = toNumber(
    pickFirst(payload, [
      'from.user_id',
      'from',
      'from_user_id',
      'message.sender.user_id',
      'payload.from.user_id',
      'payload.from',
    ]),
  );

  if (!userId) {
    throw new Error('MAX webhook не содержит ID пользователя (from.user_id)');
  }

  const eventType =
    String(pickFirst(payload, ['update_type', 'type', 'payload.type']) || 'message_created') ||
    'message_created';
  const isCallback = eventType === 'message_callback' || eventType === 'callback_query';

  const text = String(
    pickFirst(payload, [
      'payload.payload',
      'payload.data',
      'payload.text',
      'message.body.text',
      'message.text',
      'text',
      'callback.payload',
    ]) || '',
  );

  const chatId = toNumber(
    pickFirst(payload, ['chat_id', 'message.recipient.chat_id', 'payload.chat_id']),
  );
  const currentNodeId = String(
    pickFirst(payload, ['context.current_node_id', 'payload.context.current_node_id']) || 'start',
  );

  return { chatId, currentNodeId, eventType, isCallback, text, userId };
};

const evaluateCondition = (
  variableValue: string,
  operator: 'contains' | 'eq' | 'neq' = 'eq',
  targetValue: string,
) => {
  if (operator === 'contains') return variableValue.includes(targetValue);
  if (operator === 'neq') return variableValue !== targetValue;
  return variableValue === targetValue;
};

const parseJsonRecord = (source?: string) => {
  if (!source) return {};
  try {
    const parsed = JSON.parse(source);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
};

const parseHeaders = (source?: string): Record<string, string> => {
  const parsed = parseJsonRecord(source) as Record<string, unknown>;

  return Object.fromEntries(
    Object.entries(parsed).filter(([, value]) => typeof value === 'string'),
  ) as Record<string, string>;
};

const getNextStep = async (context: IncomingContext): Promise<ExecutionResult> => {
  const flow = await readFlow();
  if (!flow) {
    return {
      contentType: 'text' as const,
      text: 'Схема бота не найдена или повреждена. Пожалуйста, сохраните схему перед тестом.',
    };
  }

  const states = await readState();
  const userKey = String(context.userId);
  const session = states[userKey] || { variables: {} };

  const { isCallback, text } = context;
  const currentNodeId = session.currentNodeId || context.currentNodeId || 'start';
  const { edges, nodes } = flow;

  if (session.waitingInputNodeId) {
    const waitingNode = nodes.find((n) => n.id === session.waitingInputNodeId);
    const variableName = waitingNode?.data?.variableName?.trim();
    if (variableName) {
      session.variables[variableName] = text;
    }
    const edge = edges.find((e) => e.source === session.waitingInputNodeId);
    session.currentNodeId = edge?.target;
    session.waitingInputNodeId = undefined;
  }

  let activeNodeId = session.currentNodeId || currentNodeId;
  if (!activeNodeId || activeNodeId === 'start') {
    const startTargetId = edges.find((edge) => edge.source === 'start')?.target;
    if (!startTargetId) {
      return {
        contentType: 'text' as const,
        text: 'Схема бота не содержит ветки от узла start',
      };
    }

    activeNodeId = startTargetId;
  }

  let guard = 0;
  while (guard < 16 && activeNodeId) {
    guard += 1;
    const node = nodes.find((n) => n.id === activeNodeId);
    if (!node) break;

    const kind = node.type || node.data?.kind || 'botMessage';
    const outgoing = edges.filter((edge) => edge.source === node.id);

    if (kind === 'inputNode') {
      session.waitingInputNodeId = node.id;
      session.currentNodeId = node.id;
      states[userKey] = session;
      await writeState(states);
      return {
        nodeId: node.id,
        text: node.data?.prompt || 'Введите значение',
      };
    }

    if (kind === 'logicNode') {
      const variableName = node.data?.variableName || '';
      const currentValue = session.variables[variableName] || '';
      const ok = evaluateCondition(currentValue, node.data?.operator, node.data?.value || '');
      const handle = ok ? 'if-true' : 'if-false';
      activeNodeId =
        outgoing.find((edge) => edge.sourceHandle === handle)?.target || outgoing[0]?.target;
      session.currentNodeId = activeNodeId;
      continue;
    }

    if (kind === 'httpRequestNode') {
      try {
        const response = await fetch(node.data?.url || '', {
          body:
            node.data?.method === 'POST'
              ? JSON.stringify(parseJsonRecord(node.data.body))
              : undefined,
          headers: parseHeaders(node.data?.headers),
          method: node.data?.method || 'GET',
        });
        const targetHandle = response.ok ? 'success' : 'error';
        activeNodeId =
          outgoing.find((edge) => edge.sourceHandle === targetHandle)?.target ||
          outgoing[0]?.target;
      } catch (error) {
        await appendWebhookLog({
          details: String(error),
          level: 'error',
          message: `HTTP нода завершилась ошибкой: ${node.data?.url || ''}`,
        });
        activeNodeId =
          outgoing.find((edge) => edge.sourceHandle === 'error')?.target || outgoing[0]?.target;
      }
      session.currentNodeId = activeNodeId;
      continue;
    }

    if (kind === 'actionNode') {
      if (node.data?.actionType === 'human_takeover') {
        session.currentNodeId = node.id;
        states[userKey] = session;
        await writeState(states);
        return {
          nodeId: node.id,
          text: 'Диалог переведён на оператора',
        };
      }
      activeNodeId = outgoing[0]?.target;
      session.currentNodeId = activeNodeId;
      continue;
    }

    if (kind === 'mediaNode') {
      session.currentNodeId = outgoing[0]?.target;
      states[userKey] = session;
      await writeState(states);
      return {
        caption: node.data?.caption || '',
        contentType:
          node.data?.mediaType === 'video'
            ? 'file'
            : (node.data?.mediaType as 'file' | 'image' | 'text'),
        fileUrl: node.data?.mediaType !== 'image' ? node.data?.url || '' : '',
        imageUrl: node.data?.mediaType === 'image' ? node.data?.url || '' : '',
        nodeId: node.id,
        text: node.data?.caption || '',
      };
    }

    const currentButtons = node.data?.buttons || [];
    let targetNodeId: string | undefined;
    if (isCallback && text) {
      targetNodeId = outgoing.find((edge) => edge.sourceHandle === text)?.target;
    } else {
      const matchedButton = currentButtons.find(
        (button) => button.id === text || button.label === text,
      );
      if (matchedButton) {
        targetNodeId = outgoing.find((edge) => edge.sourceHandle === matchedButton.id)?.target;
      }
    }
    if (!targetNodeId) targetNodeId = outgoing[0]?.target;

    session.currentNodeId = targetNodeId;
    states[userKey] = session;
    await writeState(states);
    return {
      buttons: currentButtons,
      contentType: node.data?.contentType || 'text',
      fileUrl: node.data?.fileUrl || '',
      imageUrl: node.data?.imageUrl || '',
      markdown: Boolean(node.data?.markdown),
      nodeId: node.id,
      text: node.data?.text || '',
    };
  }

  return { text: 'Дальнейшие шаги не найдены. Создайте больше нод и свяжите их.' };
};

export const POST = async (req: Request) => {
  try {
    const payload = (await req.json()) as unknown;
    const context = parseIncomingContext(payload);
    const api = new MaxAPI(appendWebhookLog);

    await appendWebhookLog({
      level: 'info',
      message: `MAX webhook: type=${context.eventType}, user=${context.userId}, node=${context.currentNodeId}, input=${context.text}`,
    });

    if (context.chatId) {
      await api.sendTypingSignal(context.chatId).catch(async (error) => {
        await appendWebhookLog({
          details: String(error),
          level: 'error',
          message: `Не удалось отправить typing в чат ${context.chatId}`,
        });
      });
    }

    const nextStep = await getNextStep(context);

    const responseText = nextStep.text || 'Извините, я вас не понимаю.';
    const buttons = (nextStep.buttons || []).map((button) => ({
      id: button.id,
      text: button.label,
    }));
    const nextNodeId = nextStep.nodeId;

    if (buttons.length > 0) {
      await api.sendButtons(context.userId, responseText, buttons);
    } else {
      if (responseText) {
        await api.sendMessage(context.userId, responseText, {
          format: nextStep.markdown ? 'markdown' : undefined,
        });
      }

      if (nextStep.contentType === 'image' && nextStep.imageUrl) {
        await api.sendAttachment(context.userId, 'image', nextStep.imageUrl);
      }

      if (nextStep.contentType === 'file' && nextStep.fileUrl) {
        await api.sendAttachment(context.userId, 'file', nextStep.fileUrl);
      }
    }

    await appendWebhookLog({
      level: 'info',
      message: `Результат парсинга: nextNode=${String(nextNodeId || 'none')}, contentType=${nextStep.contentType || 'text'}`,
    });

    return NextResponse.json({
      response: {
        buttons: nextStep.buttons || [],
        contentType: nextStep.contentType || 'text',
        fileUrl: nextStep.fileUrl || '',
        imageUrl: nextStep.imageUrl || '',
        nodeId: nextNodeId,
        text: responseText,
      },
      status: 'ok',
    });
  } catch (error) {
    console.error('Webhook error:', error);
    await appendWebhookLog({
      details: String(error),
      level: 'error',
      message: `Webhook error: ${String(error)}`,
    });
    return NextResponse.json({ status: 'error', message: String(error) }, { status: 500 });
  }
};
