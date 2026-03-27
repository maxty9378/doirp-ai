import { useCallback, useEffect, useState } from 'react';
import Select from 'react-select';

import { useLiveAPIContext } from '../../contexts/LiveAPIContext';

const voiceOptions = [
  { value: 'Puck', label: 'Puck' },
  { value: 'Charon', label: 'Charon' },
  { value: 'Kore', label: 'Kore' },
  { value: 'Fenrir', label: 'Fenrir' },
  { value: 'Aoede', label: 'Aoede' },
];

export default function VoiceSelector() {
  const { config, setConfig } = useLiveAPIContext();
  const [selectedOption, setSelectedOption] = useState<{ label: string; value: string } | null>(
    voiceOptions[4],
  );

  useEffect(() => {
    const voiceName =
      config.speechConfig?.voiceConfig?.prebuiltVoiceConfig?.voiceName || voiceOptions[4].value;

    setSelectedOption({ label: voiceName, value: voiceName });
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
    <div className="select-group">
      <label htmlFor="voice-selector">Голос</label>
      <Select
        className="react-select"
        classNamePrefix="react-select"
        defaultValue={selectedOption}
        id="voice-selector"
        onChange={(option) => {
          setSelectedOption(option);
          if (option) {
            updateConfig(option.value);
          }
        }}
        options={voiceOptions}
        styles={{
          control: (baseStyles) => ({
            ...baseStyles,
            background: 'var(--neutral-15)',
            border: 0,
            color: 'var(--neutral-90)',
            maxHeight: '33px',
            minHeight: '33px',
          }),
          option: (styles, { isFocused, isSelected }) => ({
            ...styles,
            backgroundColor: isFocused
              ? 'var(--neutral-30)'
              : isSelected
                ? 'var(--neutral-20)'
                : undefined,
          }),
        }}
        value={selectedOption}
      />
    </div>
  );
}
