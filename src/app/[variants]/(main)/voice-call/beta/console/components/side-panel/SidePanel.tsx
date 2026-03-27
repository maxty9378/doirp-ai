import './react-select.scss';
import './side-panel.scss';

import { useEffect, useRef, useState } from 'react';
import Select from 'react-select';

import { useLiveAPIContext } from '../../contexts/LiveAPIContext';
import { cx } from '../../lib/cx';
import { useLoggerStore } from '../../lib/store-logger';
import Logger, { LoggerFilterType } from '../logger/Logger';

const filterOptions = [
  { value: 'conversations', label: 'Диалог' },
  { value: 'tools', label: 'Инструменты' },
  { value: 'none', label: 'Все' },
];

export default function SidePanel() {
  const { client, connected } = useLiveAPIContext();
  const [open, setOpen] = useState(true);
  const loggerRef = useRef<HTMLDivElement>(null);
  const loggerLastHeightRef = useRef<number>(-1);
  const { log, logs } = useLoggerStore();
  const [textInput, setTextInput] = useState('');
  const [selectedOption, setSelectedOption] = useState<{ label: string; value: string } | null>(
    null,
  );
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!loggerRef.current) return;

    const el = loggerRef.current;
    const scrollHeight = el.scrollHeight;
    if (scrollHeight !== loggerLastHeightRef.current) {
      el.scrollTop = scrollHeight;
      loggerLastHeightRef.current = scrollHeight;
    }
  }, [logs]);

  useEffect(() => {
    client.on('log', log);

    return () => {
      client.off('log', log);
    };
  }, [client, log]);

  const handleSubmit = () => {
    client.send([{ text: textInput }]);
    setTextInput('');

    if (inputRef.current) {
      inputRef.current.innerText = '';
    }
  };

  return (
    <div className={`side-panel ${open ? 'open' : ''}`}>
      <header className="top">
        <h2>Консоль</h2>
        {open ? (
          <button className="opener" onClick={() => setOpen(false)}>
            {'<'}
          </button>
        ) : (
          <button className="opener" onClick={() => setOpen(true)}>
            {'>'}
          </button>
        )}
      </header>

      <section className="indicators">
        <Select
          className="react-select"
          classNamePrefix="react-select"
          defaultValue={selectedOption}
          onChange={(next) => setSelectedOption(next)}
          options={filterOptions}
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
        <div className={cx('streaming-indicator', { connected })}>
          {connected ? `${open ? '● Поток' : '●'}` : `${open ? '◼ Пауза' : '◼'}`}
        </div>
      </section>

      <div className="side-panel-container" ref={loggerRef}>
        <Logger filter={(selectedOption?.value as LoggerFilterType) || 'none'} />
      </div>

      <div className={cx('input-container', { disabled: !connected })}>
        <div className="input-content">
          <textarea
            className="input-area"
            onChange={(e) => setTextInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                e.stopPropagation();
                handleSubmit();
              }
            }}
            ref={inputRef}
            value={textInput}
          />
          <span className={cx('input-content-placeholder', { hidden: textInput.length > 0 })}>
            Напишите сообщение…
          </span>

          <button
            className="send-button material-symbols-outlined filled"
            onClick={handleSubmit}
            title="Отправить"
          >
            send
          </button>
        </div>
      </div>
    </div>
  );
}
