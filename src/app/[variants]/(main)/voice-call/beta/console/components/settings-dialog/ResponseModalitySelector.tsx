import { Modality } from '@google/genai';
import { useCallback, useState } from 'react';
import Select from 'react-select';

import { useLiveAPIContext } from '../../contexts/LiveAPIContext';

const responseOptions = [
  { value: 'audio', label: 'Аудио' },
  { value: 'text', label: 'Текст' },
];

export default function ResponseModalitySelector() {
  const { config, setConfig } = useLiveAPIContext();
  const [selectedOption, setSelectedOption] = useState<{ label: string; value: string } | null>(
    responseOptions[0],
  );

  const updateConfig = useCallback(
    (modality: 'audio' | 'text') => {
      setConfig({
        ...config,
        responseModalities: [modality === 'audio' ? Modality.AUDIO : Modality.TEXT],
      });
    },
    [config, setConfig],
  );

  return (
    <div className="select-group">
      <label htmlFor="response-modality-selector">Формат ответа</label>
      <Select
        className="react-select"
        classNamePrefix="react-select"
        defaultValue={selectedOption}
        id="response-modality-selector"
        onChange={(option) => {
          setSelectedOption(option);

          if (option && (option.value === 'audio' || option.value === 'text')) {
            updateConfig(option.value);
          }
        }}
        options={responseOptions}
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
      />
    </div>
  );
}
