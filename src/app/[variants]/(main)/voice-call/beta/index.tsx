'use client';

import type { LiveConnectConfig } from '@google/genai';
import { Alert, Button, Icon, Text } from '@lobehub/ui';
import { useRequest } from 'ahooks';
import { createStyles } from 'antd-style';
import { Loader2, RefreshCw } from 'lucide-react';
import { memo, useMemo, useRef, useState } from 'react';

import { Altair } from './console/components/altair/Altair';
import ControlTray from './console/components/control-tray/ControlTray';
import SidePanel from './console/components/side-panel/SidePanel';
import './console/App.scss';
import { LiveAPIProvider } from './console/contexts/LiveAPIContext';
import type { LiveClientOptions } from './console/types';

const useStyles = createStyles(({ css, token }) => ({
  errorWrap: css`
    display: flex;
    flex-direction: column;
    gap: 16px;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
    padding: 32px;
  `,
  loading: css`
    display: flex;
    flex-direction: column;
    gap: 16px;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
    padding: 32px;
    color: ${token.colorTextSecondary};
  `,
}));

interface BetaConfigPayload {
  apiKey: string;
  defaultConfig?: LiveConnectConfig;
  defaultModel: string;
  defaultVoice?: string;
  proxyBaseUrl?: string | null;
}

const DEFAULT_GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com';

const fetchBetaConfig = async (): Promise<BetaConfigPayload> => {
  const res = await fetch('/api/voice-call/beta/config', {
    credentials: 'include',
  });

  const body = (await res.json().catch(() => ({}))) as BetaConfigPayload & { error?: string };

  if (!res.ok) {
    throw new Error(body.error || 'Не удалось получить конфигурацию beta-консоли.');
  }

  return body;
};

const BetaLiveConsoleApp = memo(() => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [videoStream, setVideoStream] = useState<MediaStream | null>(null);

  return (
    <div className="voice-call-beta-page">
      <div className="streaming-console">
        <SidePanel />
        <main>
          <div className="main-app-area">
            <Altair />
            <video
              autoPlay
              className={!videoStream ? 'stream hidden' : 'stream'}
              playsInline
              ref={videoRef}
            />
          </div>

          <ControlTray
            enableEditingSettings
            onVideoStreamChange={setVideoStream}
            supportsVideo
            videoRef={videoRef}
          />
        </main>
      </div>
    </div>
  );
});

const VoiceCallBetaPage = memo(() => {
  const { styles } = useStyles();
  const { data, error, loading, refresh } = useRequest(fetchBetaConfig);

  const liveOptions = useMemo<LiveClientOptions | null>(() => {
    if (!data?.apiKey) return null;

    return {
      apiKey: data.apiKey,
      httpOptions: {
        apiVersion: 'v1beta',
        baseUrl: data.proxyBaseUrl || DEFAULT_GEMINI_BASE_URL,
      },
    };
  }, [data]);

  if (error) {
    return (
      <div className={styles.errorWrap}>
        <Alert
          description={error.message}
          message="Не удалось открыть beta-консоль"
          showIcon
          type="error"
        />
        <Button icon={<RefreshCw size={16} />} onClick={() => refresh()}>
          Повторить
        </Button>
      </div>
    );
  }

  if (loading || !liveOptions || !data) {
    return (
      <div className={styles.loading}>
        <Icon icon={Loader2} spin />
        <Text>Загружаю beta-консоль Gemini Live…</Text>
      </div>
    );
  }

  return (
    <LiveAPIProvider
      initialConfig={data.defaultConfig}
      initialModel={data.defaultModel}
      options={liveOptions}
    >
      <BetaLiveConsoleApp />
    </LiveAPIProvider>
  );
});

VoiceCallBetaPage.displayName = 'VoiceCallBetaPage';

export default VoiceCallBetaPage;
