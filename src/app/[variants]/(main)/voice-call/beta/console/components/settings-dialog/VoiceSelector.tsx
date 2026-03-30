import { useCallback, useEffect, useState } from 'react';

import { useLiveAPIContext } from '../../contexts/LiveAPIContext';

const voiceOptions = [
  { value: 'Puck', title: 'Puck', description: 'Игривый тембр' },
  { value: 'Charon', title: 'Charon', description: 'Уверенный тембр' },
  { value: 'Kore', title: 'Kore', description: 'Спокойный тембр' },
  { value: 'Fenrir', title: 'Fenrir', description: 'Живой тембр' },
  { value: 'Aoede', title: 'Aoede', description: 'Мягкий тембр' },
] as const;

export default function VoiceSelector() {
  const { config, setConfig } = useLiveAPIContext();

  const getCurrentVoice = () =>
    config.speechConfig?.voiceConfig?.prebuiltVoiceConfig?.voiceName || voiceOptions[1].value;

  const [selectedVoice, setSelectedVoice] = useState<string>(getCurrentVoice());

  useEffect(() => {
    setSelectedVoice(getCurrentVoice());
  }, [config]);

  const updateConfig = useCallback(
    (voiceName: string) => {
      setConfig({
        ...config,
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: {
              voiceName,
            },
          },
        },
      });
    },
    [config, setConfig],
  );

  return (
    <div className="voice-selector">
      <div className="voice-selector-label">Голос</div>

      <div aria-label="Выбор голоса" className="voice-options" role="radiogroup">
        {voiceOptions.map((item) => {
          const isSelected = item.value === selectedVoice;

          return (
            <button
              aria-checked={isSelected}
              className={`voice-option ${isSelected ? 'active' : ''}`}
              key={item.value}
              role="radio"
              type="button"
              onClick={() => {
                setSelectedVoice(item.value);
                updateConfig(item.value);
              }}
            >
              <div className="voice-option-main">
                <div className="voice-option-title">{item.title}</div>
                <div className="voice-option-desc">{item.description}</div>
              </div>
              <div aria-hidden className="voice-option-check">
                {isSelected ? '✓' : ''}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
