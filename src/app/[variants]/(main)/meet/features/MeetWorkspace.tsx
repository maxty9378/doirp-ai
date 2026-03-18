'use client';

import {
  LiveKitRoom,
  PreJoin,
  RoomAudioRenderer,
  VideoConference,
} from '@livekit/components-react';
import '@livekit/components-styles';
import { Button, Input, Form, Typography } from 'antd';
import { Flexbox } from '@lobehub/ui';
import { memo, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import { useUserStore } from '@/store/user';
import { authSelectors, userProfileSelectors } from '@/store/user/selectors';

const { Title } = Typography;

const MeetWorkspace = memo(() => {
  const [searchParams, setSearchParams] = useSearchParams();
  const roomFromUrl = searchParams.get('room');
  
  const [roomName, setRoomName] = useState(roomFromUrl || 'doirp-test-room');
  const [token, setToken] = useState('');
  const [preJoinPassed, setPreJoinPassed] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isLogin = useUserStore(authSelectors.isLogin);
  const displayName = useUserStore(userProfileSelectors.displayUserName);
  
  const serverUrl = process.env.NEXT_PUBLIC_LIVEKIT_URL || '';

  useEffect(() => {
    if (roomFromUrl && token === '') {
      setRoomName(roomFromUrl);
    }
  }, [roomFromUrl]);

  const joinRoom = async (name: string = roomName) => {
    if (!name) return;
    setConnecting(true);
    setError(null);
    try {
      const resp = await fetch(`/api/livekit/meet-token?room=${encodeURIComponent(name)}`);
      const data = await resp.json();
      
      if (!resp.ok) {
        throw new Error(data.error || 'Failed to get token');
      }
      
      setToken(data.token);
      if (!searchParams.has('room')) {
        setSearchParams({ room: name });
      }
    } catch (e: any) {
      console.error(e);
      setError(e.message);
    } finally {
      setConnecting(false);
    }
  };

  const copyInviteLink = () => {
    const url = new URL(window.location.href);
    url.searchParams.set('room', roomName);
    navigator.clipboard.writeText(url.toString());
    alert('Ссылка скопирована!');
  };

  if (token === '') {
    return (
      <Flexbox align="center" justify="center" height="100%">
        <div style={{ maxWidth: 400, width: '100%', padding: 24, background: 'var(--colorBgContainer)', borderRadius: 12, border: '1px solid var(--colorBorderSecondary)', boxShadow: '0 8px 24px rgba(0,0,0,0.1)' }}>
          <Title level={2} style={{ marginBottom: 24, textAlign: 'center' }}>Звонки ДОиРП</Title>
          {error && <div style={{ color: 'red', marginBottom: 16 }}>{error}</div>}
          <Form layout="vertical" onFinish={() => joinRoom()}>
            <Form.Item label="Название комнаты">
              <Input
                size="large"
                value={roomName}
                onChange={(e) => {
                  setRoomName(e.target.value);
                  setSearchParams({ room: e.target.value });
                }}
                placeholder="Введите название комнаты..."
              />
            </Form.Item>
            <Flexbox gap={12} direction="column">
              <Button
                type="primary"
                size="large"
                block
                loading={connecting}
                onClick={() => joinRoom()}
                disabled={!roomName || !serverUrl}
              >
                Подключиться
              </Button>
              <Button size="large" block onClick={copyInviteLink} disabled={!roomName}>
                Копировать ссылку для приглашения
              </Button>
            </Flexbox>
            {!serverUrl && (
              <div style={{ color: 'orange', marginTop: 16, fontSize: 12 }}>
                Внимание: не задана переменная NEXT_PUBLIC_LIVEKIT_URL
              </div>
            )}
          </Form>
        </div>
      </Flexbox>
    );
  }

  if (!preJoinPassed) {
    return (
      <Flexbox align="center" justify="center" height="100%" width="100%">
        <div className="lk-prejoin-container" style={{ width: '100%', maxWidth: '800px', padding: '20px' }}>
          <PreJoin
            onError={(e) => setError(e.message)}
            defaults={{
              videoEnabled: true,
              audioEnabled: true,
              userName: displayName || '',
            }}
            onSubmit={() => setPreJoinPassed(true)}
            translations={{
              joinButton: 'Подключиться',
              userNameField: 'Ваше имя',
              connecting: 'Подключение...',
              audioButton: 'Микрофон',
              videoButton: 'Камера',
            }}
          />
        </div>
        <style>{`
          /* Сильнодействующие хаки для перевода PreJoin */
          
          /* Скрываем поле ввода имени, если мы знаем его из профиля */
          ${(isLogin && displayName && displayName !== 'anonymous') ? '.lk-prejoin-name { display: none !important; }' : ''}
          
          /* Если поле всё же показывается, переводим его заголовок */
          .lk-prejoin-name label { font-size: 0 !important; }
          .lk-prejoin-name label::before { content: 'Ваше имя'; font-size: 14px !important; }
          
          .lk-prejoin-container {
            background: var(--colorBgContainer);
            border-radius: 16px;
            border: 1px solid var(--colorBorderSecondary);
            box-shadow: var(--shadow-elevated);
            color: var(--colorText);
          }
          
          .lk-prejoin-container label {
            color: var(--colorTextSecondary);
          }

          /* Перевод кнопок Микрофон и Камера в PreJoin */
          .lk-device-menu-renderer button.lk-button {
             position: relative;
             color: transparent !important;
          }
          .lk-device-menu-renderer button.lk-button::after {
             position: absolute;
             left: 0; top: 0; width: 100%; height: 100%;
             display: flex; align-items: center; justify-content: center;
             color: var(--colorText);
             font-size: 0.875rem;
          }
          .lk-device-menu-renderer[data-lk-device-type="audioinput"] button.lk-button::after { content: 'Микрофон'; }
          .lk-device-menu-renderer[data-lk-device-type="videoinput"] button.lk-button::after { content: 'Камера'; }

          .lk-prejoin-container button.lk-button {
            border-radius: 8px;
            font-family: var(--font-family);
          }

          /* Перевод основной кнопки Join Room */
          .lk-prejoin-container button.lk-button-primary {
            color: transparent !important;
            position: relative !important;
            background: var(--colorPrimary) !important;
            opacity: 1 !important;
          }
          .lk-prejoin-container button.lk-button-primary::after {
            content: 'Подключиться к звонку';
            position: absolute;
            left: 0; top: 0; width: 100%; height: 100%;
            display: flex; align-items: center; justify-content: center;
            color: white !important;
            font-weight: 600;
            font-size: 1rem;
            visibility: visible !important;
          }
        `}</style>
      </Flexbox>
    );
  }

  return (
    <LiveKitRoom
      video={true}
      audio={true}
      token={token}
      serverUrl={serverUrl}
      connect={true}
      data-lk-theme="default"
      style={{ height: '100%', width: '100%', position: 'relative' }}
      onDisconnected={() => {
        setToken('');
        setPreJoinPassed(false);
      }}
    >
      <VideoConference
        chatMessageFormatter={(msg) => msg.message}
      />
      <RoomAudioRenderer />
      <div style={{ position: 'absolute', top: 16, right: 16, zIndex: 1000 }}>
        <Button size="small" type="primary" onClick={copyInviteLink}>
          Пригласить
        </Button>
      </div>
      <style>{`
        /* Общие стили темы LobeChat для LiveKit */
        :root {
          --lk-accent-bg: var(--colorPrimary);
          --lk-accent-fg: white;
          --lk-bg: var(--colorBgLayout);
          --lk-fg: var(--colorText);
          --lk-border-color: var(--colorBorderSecondary);
        }

        .lk-video-conference {
          background-color: var(--colorBgLayout);
        }

        .lk-control-bar {
          background-color: var(--colorBgContainer);
          border-top: 1px solid var(--colorBorderSecondary);
          padding: 12px;
        }

        /* Control Bar Translations */
        .lk-control-bar button[data-lk-source="microphone"] .lk-button-label { display: none; }
        .lk-control-bar button[data-lk-source="microphone"]::after { content: 'Микрофон'; font-size: 0.75rem; }
        
        .lk-control-bar button[data-lk-source="camera"] .lk-button-label { display: none; }
        .lk-control-bar button[data-lk-source="camera"]::after { content: 'Камера'; font-size: 0.75rem; }
        
        .lk-control-bar button[data-lk-source="screen_share"] .lk-button-label { display: none; }
        .lk-control-bar button[data-lk-source="screen_share"]::after { content: 'Экран'; font-size: 0.75rem; }
        
        .lk-control-bar button.lk-chat-toggle .lk-button-label { display: none; }
        .lk-control-bar button.lk-chat-toggle::after { content: 'Чат'; font-size: 0.75rem; }
        
        .lk-control-bar button.lk-disconnect-button {
          background-color: var(--colorError) !important;
        }
        .lk-control-bar button.lk-disconnect-button .lk-button-label { display: none; }
        .lk-control-bar button.lk-disconnect-button::after { content: 'Выйти'; font-size: 0.75rem; color: white; }
        
        /* Chat Translations */
        .lk-chat {
          background-color: var(--colorBgContainer);
          border-left: 1px solid var(--colorBorderSecondary);
        }

        .lk-chat-header { visibility: hidden; position: relative; height: 3rem; border-bottom: 1px solid var(--colorBorderSecondary); }
        .lk-chat-header::after { 
          content: 'Сообщения'; 
          visibility: visible; 
          position: absolute; 
          left: 1rem; 
          top: 0; 
          height: 100%; 
          display: flex; 
          align-items: center; 
          font-weight: 600; 
          font-size: 0.875rem;
          color: var(--colorText);
        }
        
        .lk-chat-form-controls button { color: transparent !important; position: relative; min-width: 80px; }
        .lk-chat-form-controls button::after { 
          content: 'Отправить'; 
          color: white; 
          position: absolute; 
          left: 0; 
          top: 0; 
          width: 100%; 
          height: 100%; 
          display: flex; 
          align-items: center; 
          justify-content: center; 
          font-size: 0.75rem; 
          background: var(--colorPrimary);
          border-radius: 8px;
        }
        
        .lk-chat-form-input { 
          color: var(--colorText); 
          background: var(--colorBgLayout);
          border: 1px solid var(--colorBorder);
          border-radius: 8px;
        }
        .lk-chat-form-input::placeholder { color: transparent !important; }
        .lk-chat-form-input-container { position: relative; }
        .lk-chat-form-input-container::before { 
          content: 'Введите сообщение...'; 
          position: absolute; 
          left: 1rem; 
          top: 50%; 
          transform: translateY(-50%); 
          pointer-events: none; 
          color: var(--colorTextQuaternary); 
          font-size: 0.875rem; 
        }
        .lk-chat-form-input:focus ~ .lk-chat-form-input-container::before,
        .lk-chat-form-input:not(:placeholder-shown) ~ .lk-chat-form-input-container::before { 
          display: none; 
        }
        
        /* Settings / Other Labels if they appear */
        .lk-settings-menu-header { visibility: hidden; position: relative; }
        .lk-settings-menu-header::after { content: 'Настройки'; visibility: visible; position: absolute; left: 1rem; }
        
        /* Participant Tile translations */
        .lk-participant-name::after {
          content: ' (вы)';
          display: none;
        }
        .lk-participant-tile[data-lk-local-participant="true"] .lk-participant-name::after {
          display: inline;
        }

        /* Заменяем Leave Room в меню если есть */
        .lk-button[data-lk-source="leave"] { font-size: 0 !important; }
        .lk-button[data-lk-source="leave"]::before { content: 'Покинуть'; font-size: 14px !important; }
      `}</style>
    </LiveKitRoom>
  );
});

export default MeetWorkspace;
