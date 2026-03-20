'use client';

import {
  MediaDeviceMenu,
  useIsRecording,
  useMaybeLayoutContext,
  useRoomContext,
} from '@livekit/components-react';
import { useMemo, useState } from 'react';

import { CameraSettings } from './CameraSettings';
import { MicrophoneSettings } from './MicrophoneSettings';

type SettingsTab = 'media' | 'recording';

export function SettingsMenu() {
  const layoutContext = useMaybeLayoutContext();
  const room = useRoomContext();
  const recordingEndpoint = process.env.NEXT_PUBLIC_LK_RECORD_ENDPOINT || '/api/livekit/record';
  const isRecording = useIsRecording();
  const [processingRecording, setProcessingRecording] = useState(false);

  const tabs = useMemo<SettingsTab[]>(
    () => (recordingEndpoint ? ['media', 'recording'] : ['media']),
    [recordingEndpoint],
  );
  const [activeTab, setActiveTab] = useState<SettingsTab>(tabs[0]);

  const toggleRecording = async () => {
    try {
      if (!recordingEndpoint) return;
      if (room.isE2EEEnabled) {
        throw new Error('Запись зашифрованных звонков сейчас не поддерживается');
      }

      setProcessingRecording(true);
      const action = isRecording ? 'stop' : 'start';
      const response = await fetch(`${recordingEndpoint}/${action}?roomName=${room.name}`);

      if (!response.ok) {
        throw new Error(await response.text());
      }
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'Не удалось изменить статус записи');
    } finally {
      setProcessingRecording(false);
    }
  };

  return (
    <div
      className="settings-menu"
      style={{
        background: 'var(--colorBgContainer)',
        color: 'var(--colorText)',
        minHeight: 360,
        position: 'relative',
        width: '100%',
      }}
    >
      <div
        style={{
          display: 'flex',
          gap: 8,
          marginBottom: 16,
          paddingBottom: 12,
          borderBottom: '1px solid var(--colorBorderSecondary)',
        }}
      >
        {tabs.map((tab) => (
          <button
            aria-pressed={activeTab === tab}
            className="lk-button"
            key={tab}
            style={{
              background: activeTab === tab ? 'var(--colorPrimary)' : 'var(--colorFillQuaternary)',
              color: activeTab === tab ? 'white' : 'var(--colorText)',
            }}
            onClick={() => setActiveTab(tab)}
          >
            {tab === 'media' ? 'Устройства' : 'Запись'}
          </button>
        ))}
      </div>

      {activeTab === 'media' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div>
            <h3 style={{ marginTop: 0, marginBottom: 12 }}>Камера</h3>
            <CameraSettings />
          </div>

          <div>
            <h3 style={{ marginTop: 0, marginBottom: 12 }}>Микрофон</h3>
            <MicrophoneSettings />
          </div>

          <div>
            <h3 style={{ marginTop: 0, marginBottom: 12 }}>Динамики и наушники</h3>
            <section className="lk-button-group">
              <span className="lk-button">Аудиовыход</span>
              <div className="lk-button-group-menu">
                <MediaDeviceMenu kind="audiooutput" />
              </div>
            </section>
          </div>
        </div>
      )}

      {activeTab === 'recording' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <h3 style={{ marginTop: 0, marginBottom: 0 }}>Запись звонка</h3>
          <p style={{ margin: 0, color: 'var(--colorTextSecondary)' }}>
            {isRecording ? 'Запись уже идёт' : 'Сейчас запись не запущена'}
          </p>
          <button className="lk-button" disabled={processingRecording} onClick={toggleRecording}>
            {isRecording ? 'Остановить запись' : 'Запустить запись'}
          </button>
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 20 }}>
        <button
          className="lk-button"
          onClick={() => layoutContext?.widget.dispatch?.({ msg: 'toggle_settings' })}
        >
          Закрыть
        </button>
      </div>
    </div>
  );
}
