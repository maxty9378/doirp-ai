'use client';

import {
  LiveKitRoom,
  VideoConference,
  RoomAudioRenderer,
  PreJoin,
} from '@livekit/components-react';
import '@livekit/components-styles';
import { Button, Input, Form, Typography } from 'antd';
import { Flexbox } from '@lobehub/ui';
import { memo, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

const { Title } = Typography;

const MeetWorkspace = memo(() => {
  const [searchParams, setSearchParams] = useSearchParams();
  const roomFromUrl = searchParams.get('room');
  
  const [roomName, setRoomName] = useState(roomFromUrl || 'doirp-test-room');
  const [token, setToken] = useState('');
  const [preJoinPassed, setPreJoinPassed] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
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
        <div style={{ maxWidth: 400, width: '100%', padding: 24, background: 'var(--colorBgContainer)', borderRadius: 12, border: '1px solid var(--colorBorderSecondary)' }}>
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
                Войти в комнату
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
            }}
            onJoinComplete={() => setPreJoinPassed(true)}
          />
        </div>
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
      <VideoConference />
      <RoomAudioRenderer />
      <div style={{ position: 'absolute', top: 16, right: 16, zIndex: 1000 }}>
        <Button size="small" type="primary" onClick={copyInviteLink}>
          Пригласить
        </Button>
      </div>
    </LiveKitRoom>
  );
});

export default MeetWorkspace;
