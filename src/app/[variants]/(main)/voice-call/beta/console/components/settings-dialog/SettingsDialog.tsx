import './settings-dialog.scss';

import { FunctionDeclaration, LiveConnectConfig, Tool } from '@google/genai';
import { ChangeEvent, FormEventHandler, useCallback, useMemo, useState } from 'react';

import { useLiveAPIContext } from '../../contexts/LiveAPIContext';
import ResponseModalitySelector from './ResponseModalitySelector';
import VoiceSelector from './VoiceSelector';

type FunctionDeclarationsTool = Tool & {
  functionDeclarations: FunctionDeclaration[];
};

export default function SettingsDialog() {
  const [open, setOpen] = useState(false);
  const { config, connected, setConfig } = useLiveAPIContext();

  const functionDeclarations: FunctionDeclaration[] = useMemo(() => {
    if (!Array.isArray(config.tools)) return [];

    return (config.tools as Tool[])
      .filter((tool: Tool): tool is FunctionDeclarationsTool =>
        Array.isArray((tool as FunctionDeclarationsTool).functionDeclarations),
      )
      .flatMap((tool) => tool.functionDeclarations || []);
  }, [config]);

  const systemInstruction = useMemo(() => {
    if (!config.systemInstruction) return '';

    if (typeof config.systemInstruction === 'string') {
      return config.systemInstruction;
    }

    if (Array.isArray(config.systemInstruction)) {
      return config.systemInstruction
        .map((part) => (typeof part === 'string' ? part : part.text))
        .join('\n');
    }

    if (typeof config.systemInstruction === 'object' && 'parts' in config.systemInstruction) {
      return config.systemInstruction.parts?.map((part) => part.text).join('\n') || '';
    }

    return '';
  }, [config]);

  const updateConfig: FormEventHandler<HTMLTextAreaElement> = useCallback(
    (event: ChangeEvent<HTMLTextAreaElement>) => {
      const newConfig: LiveConnectConfig = {
        ...config,
        systemInstruction: event.target.value,
      };

      setConfig(newConfig);
    },
    [config, setConfig],
  );

  const updateFunctionDescription = useCallback(
    (editedFdName: string, newDescription: string) => {
      const newConfig: LiveConnectConfig = {
        ...config,
        tools:
          config.tools?.map((tool) => {
            const fdTool = tool as FunctionDeclarationsTool;
            if (!Array.isArray(fdTool.functionDeclarations)) {
              return tool;
            }

            return {
              ...tool,
              functionDeclarations: fdTool.functionDeclarations.map((fd) =>
                fd.name === editedFdName ? { ...fd, description: newDescription } : fd,
              ),
            };
          }) || [],
      };

      setConfig(newConfig);
    },
    [config, setConfig],
  );

  return (
    <div className="settings-dialog">
      <button className="action-button material-symbols-outlined" onClick={() => setOpen(!open)}>
        settings
      </button>
      <dialog className="dialog" style={{ display: open ? 'block' : 'none' }}>
        <div className={`dialog-container ${connected ? 'disabled' : ''}`}>
          {connected && (
            <div className="connected-indicator">
              <p>
                Эти настройки применяются только до подключения и переопределяют текущую
                конфигурацию.
              </p>
            </div>
          )}

          <div className="mode-selectors">
            <ResponseModalitySelector />
            <VoiceSelector />
          </div>

          <h3>Системные инструкции</h3>
          <textarea className="system" onChange={updateConfig} value={systemInstruction} />

          <h4>Объявления функций</h4>
          <div className="function-declarations">
            <div className="fd-rows">
              {functionDeclarations.map((fd, fdKey) => (
                <div className="fd-row" key={`function-${fdKey}`}>
                  <span className="fd-row-name">{fd.name}</span>
                  <span className="fd-row-args">
                    {Object.keys(fd.parameters?.properties || {}).map((item, index) => (
                      <span key={index}>{item}</span>
                    ))}
                  </span>
                  <input
                    className="fd-row-description"
                    defaultValue={fd.description}
                    key={`fd-${fd.description}`}
                    onBlur={(e) => updateFunctionDescription(fd.name!, e.target.value)}
                    type="text"
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      </dialog>
    </div>
  );
}
