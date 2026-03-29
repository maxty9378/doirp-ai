import './logger.scss';

import type {
  Content,
  LiveClientToolResponse,
  LiveServerContent,
  LiveServerToolCall,
  LiveServerToolCallCancellation,
  Part,
} from '@google/genai/web';
import type { ReactNode } from 'react';
import { memo } from 'react';
import SyntaxHighlighter from 'react-syntax-highlighter';
import { vs2015 as dark } from 'react-syntax-highlighter/dist/esm/styles/hljs';

import { cx } from '../../lib/cx';
import { useLoggerStore } from '../../lib/store-logger';
import type { ClientContentLog as ClientContentLogType, StreamingLog } from '../../types';

const formatTime = (date: Date) => date.toLocaleTimeString().slice(0, -3);

const LogEntry = memo(
  ({
    log,
    MessageComponent,
  }: {
    log: StreamingLog;
    MessageComponent: ({ message }: { message: StreamingLog['message'] }) => ReactNode;
  }) => (
    <li
      className={cx(`plain-log`, `source-${log.type.slice(0, log.type.indexOf('.'))}`, {
        receive: log.type.includes('receive'),
        send: log.type.includes('send'),
      })}
    >
      <span className="timestamp">{formatTime(log.date)}</span>
      <span className="source">{log.type}</span>
      <span className="message">
        <MessageComponent message={log.message} />
      </span>
      {log.count && <span className="count">{log.count}</span>}
    </li>
  ),
);

const PlainTextMessage = ({ message }: { message: StreamingLog['message'] }) => (
  <span>{message as string}</span>
);

type Message = { message: StreamingLog['message'] };

const AnyMessage = ({ message }: Message) => <pre>{JSON.stringify(message, null, '  ')}</pre>;

const tryParseCodeExecutionResult = (output: string) => {
  try {
    return JSON.stringify(JSON.parse(output), null, '  ');
  } catch {
    return output;
  }
};

const RenderPart = memo(({ part }: { part: Part }) => {
  if (part.text && part.text.length) {
    return <p className="part part-text">{part.text}</p>;
  }

  if (part.executableCode) {
    return (
      <div className="part part-executableCode">
        <h5>Исполняемый код: {part.executableCode.language}</h5>
        <SyntaxHighlighter language={part.executableCode.language?.toLowerCase()} style={dark}>
          {part.executableCode.code}
        </SyntaxHighlighter>
      </div>
    );
  }

  if (part.codeExecutionResult) {
    return (
      <div className="part part-codeExecutionResult">
        <h5>Результат выполнения: {part.codeExecutionResult.outcome}</h5>
        <SyntaxHighlighter language="json" style={dark}>
          {tryParseCodeExecutionResult(part.codeExecutionResult.output || '')}
        </SyntaxHighlighter>
      </div>
    );
  }

  if (part.inlineData) {
    return (
      <div className="part part-inlinedata">
        <h5>Встроенные данные: {part.inlineData.mimeType}</h5>
      </div>
    );
  }

  return <div className="part part-unknown">&nbsp;</div>;
});

const ClientContentLog = memo(({ message }: Message) => {
  const { turnComplete, turns } = message as ClientContentLogType;
  const textParts = turns.filter((part) => !(part.text && part.text === '\n'));

  return (
    <div className="rich-log client-content user">
      <h4 className="roler-user">Пользователь</h4>
      <div key="message-turn">
        {textParts.map((part, index) => (
          <RenderPart key={`message-part-${index}`} part={part} />
        ))}
      </div>
      {!turnComplete ? <span>turnComplete: false</span> : null}
    </div>
  );
});

const ToolCallLog = memo(({ message }: Message) => {
  const { toolCall } = message as { toolCall: LiveServerToolCall };

  return (
    <div className={cx('rich-log tool-call')}>
      {toolCall.functionCalls?.map((functionCall) => (
        <div className="part part-functioncall" key={functionCall.id}>
          <h5>Вызов функции: {functionCall.name}</h5>
          <SyntaxHighlighter language="json" style={dark}>
            {JSON.stringify(functionCall, null, '  ')}
          </SyntaxHighlighter>
        </div>
      ))}
    </div>
  );
});

const ToolCallCancellationLog = ({ message }: Message) => (
  <div className={cx('rich-log tool-call-cancellation')}>
    <span>
      ids:{' '}
      {(
        message as { toolCallCancellation: LiveServerToolCallCancellation }
      ).toolCallCancellation.ids?.map((id) => (
        <span className="inline-code" key={`cancel-${id}`}>
          "{id}"
        </span>
      ))}
    </span>
  </div>
);

const ToolResponseLog = memo(({ message }: Message) => (
  <div className={cx('rich-log tool-response')}>
    {(message as LiveClientToolResponse).functionResponses?.map((response) => (
      <div className="part" key={`tool-response-${response.id}`}>
        <h5>Ответ функции: {response.id}</h5>
        <SyntaxHighlighter language="json" style={dark}>
          {JSON.stringify(response.response, null, '  ')}
        </SyntaxHighlighter>
      </div>
    ))}
  </div>
));

const ModelTurnLog = ({ message }: Message) => {
  const serverContent = (message as { serverContent: LiveServerContent }).serverContent;
  const { modelTurn } = serverContent as { modelTurn: Content };

  return (
    <div className="rich-log model-turn model">
      <h4 className="role-model">Модель</h4>
      {modelTurn.parts
        ?.filter((part) => !(part.text && part.text === '\n'))
        .map((part, index) => (
          <RenderPart key={`model-turn-part-${index}`} part={part} />
        ))}
    </div>
  );
};

const CustomPlainTextLog = (message: string) => () => <PlainTextMessage message={message} />;

export type LoggerFilterType = 'conversations' | 'tools' | 'none';

export type LoggerProps = {
  filter: LoggerFilterType;
};

const filters: Record<LoggerFilterType, (log: StreamingLog) => boolean> = {
  tools: (log: StreamingLog) =>
    typeof log.message === 'object' &&
    ('toolCall' in log.message ||
      'functionResponses' in log.message ||
      'toolCallCancellation' in log.message),
  conversations: (log: StreamingLog) =>
    typeof log.message === 'object' &&
    (('turns' in log.message && 'turnComplete' in log.message) || 'serverContent' in log.message),
  none: () => true,
};

const component = (log: StreamingLog) => {
  if (typeof log.message === 'string') return PlainTextMessage;
  if ('turns' in log.message && 'turnComplete' in log.message) return ClientContentLog;
  if ('toolCall' in log.message) return ToolCallLog;
  if ('toolCallCancellation' in log.message) return ToolCallCancellationLog;
  if ('functionResponses' in log.message) return ToolResponseLog;

  if ('serverContent' in log.message) {
    const { serverContent } = log.message;

    if (serverContent?.interrupted) return CustomPlainTextLog('interrupted');
    if (serverContent?.turnComplete) return CustomPlainTextLog('turnComplete');
    if (serverContent && 'modelTurn' in serverContent) return ModelTurnLog;
  }

  return AnyMessage;
};

export default function Logger({ filter = 'none' }: LoggerProps) {
  const { logs } = useLoggerStore();
  const filterFn = filters[filter];

  return (
    <div className="logger">
      <ul className="logger-list">
        {logs.filter(filterFn).map((log, index) => (
          <LogEntry MessageComponent={component(log)} key={index} log={log} />
        ))}
      </ul>
    </div>
  );
}
