'use client';

import '@livekit/components-styles';

import type { LocalUserChoices } from '@livekit/components-react';
import { Flexbox } from '@lobehub/ui';
import { Button, Checkbox, Collapse, Input, Select, Switch, Tag, Typography } from 'antd';
import { LogLevel, type VideoCodec } from 'livekit-client';
import { memo, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import { useUserStore } from '@/store/user';
import { authSelectors, userProfileSelectors } from '@/store/user/selectors';

import {
  decodePassphrase,
  encodePassphrase,
  generateRoomId,
  isVideoCodec,
  randomString,
} from './client-utils';
import { MeetPreJoin } from './MeetPreJoin';
import { type MeetingConnectionDetails, MeetRoom } from './MeetRoom';
import { type ConnectionDetails } from './types';

const { Paragraph, Title } = Typography;

const JOIN_BUTTON_LABEL = 'Присоединиться к звонку';

const CODEC_OPTIONS: { label: string; value: VideoCodec }[] = [
  { label: 'VP9', value: 'vp9' },
  { label: 'VP8', value: 'vp8' },
  { label: 'H.264', value: 'h264' },
  { label: 'AV1', value: 'av1' },
];

const translateErrorMessage = (message: string) => {
  const knownMessages: Record<string, string> = {
    'Failed to get token': 'Не удалось получить токен подключения',
    'LiveKit credentials are not configured': 'Переменные LiveKit не настроены',
    'Missing "room" query parameter': 'Не указано название комнаты',
    'Missing "roomName" query parameter': 'Не указано название комнаты',
    'Missing "participantName" query parameter': 'Не указано имя участника',
    'Recording of encrypted meetings is currently not supported':
      'Запись зашифрованных звонков сейчас не поддерживается',
    'Unauthorized': 'Нужно войти в аккаунт, чтобы присоединиться к звонку',
  };

  return knownMessages[message] || message;
};

const MeetWorkspace = memo(() => {
  const [searchParams, setSearchParams] = useSearchParams();
  const roomFromUrl = searchParams.get('room') || '';
  const regionFromUrl = searchParams.get('region') || '';
  const hqFromUrl = searchParams.get('hq') === 'true';
  const codecFromUrl = searchParams.get('codec');
  const codec = codecFromUrl && isVideoCodec(codecFromUrl) ? codecFromUrl : 'vp9';
  const hashPassphrase =
    typeof window !== 'undefined' ? decodePassphrase(window.location.hash.slice(1)) : '';

  const [roomName, setRoomName] = useState(() => roomFromUrl || generateRoomId());
  const [region, setRegion] = useState(regionFromUrl);
  const [hq, setHq] = useState(hqFromUrl);
  const [selectedCodec, setSelectedCodec] = useState<VideoCodec>(codec);
  const [demoE2EE, setDemoE2EE] = useState(Boolean(hashPassphrase && roomFromUrl));
  const [demoPassphrase, setDemoPassphrase] = useState(() => hashPassphrase || randomString(64));
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preJoinChoices, setPreJoinChoices] = useState<LocalUserChoices>();
  const [connectionDetails, setConnectionDetails] = useState<ConnectionDetails>();

  const isLogin = useUserStore(authSelectors.isLogin);
  const displayName = useUserStore(userProfileSelectors.displayUserName);
  const profileName = isLogin && displayName && displayName !== 'anonymous' ? displayName : '';
  const shouldHideNameField = Boolean(profileName);

  const serverUrl = process.env.NEXT_PUBLIC_LIVEKIT_URL || '';

  const updateSearchState = (updates: Record<string, string | undefined>) => {
    const next = new URLSearchParams(searchParams);

    for (const [key, value] of Object.entries(updates)) {
      if (!value) {
        next.delete(key);
      } else {
        next.set(key, value);
      }
    }

    setSearchParams(next);
  };

  const resetConferenceState = (options: { preserveError?: boolean } = {}) => {
    setConnectionDetails(undefined);
    setPreJoinChoices(undefined);

    if (!options.preserveError) {
      setError(null);
    }
  };

  const syncHash = (enabled: boolean, passphrase: string) => {
    if (typeof window === 'undefined') return;

    window.location.hash = enabled ? encodePassphrase(passphrase) : '';
  };

  const openLanding = (options: { preserveError?: boolean } = {}) => {
    resetConferenceState(options);
    updateSearchState({
      codec: selectedCodec,
      hq: hq ? 'true' : undefined,
      liveKitUrl: undefined,
      region: region.trim() || undefined,
      room: undefined,
      singlePC: undefined,
      token: undefined,
    });
    syncHash(false, '');
  };

  const copyInviteLink = () => {
    const url = new URL(window.location.href);

    if (roomFromUrl) {
      url.searchParams.set('room', roomFromUrl);
    }

    navigator.clipboard.writeText(url.toString());
    window.alert('Ссылка скопирована!');
  };

  const copyDemoInviteLink = (inviteRoomName: string) => {
    const url = new URL(window.location.href);

    url.searchParams.set('room', inviteRoomName);
    url.searchParams.set('tab', 'demo');
    url.searchParams.set('codec', selectedCodec);

    if (region.trim()) {
      url.searchParams.set('region', region.trim());
    } else {
      url.searchParams.delete('region');
    }

    if (hq) {
      url.searchParams.set('hq', 'true');
    } else {
      url.searchParams.delete('hq');
    }

    url.hash = demoE2EE ? encodePassphrase(demoPassphrase) : '';

    navigator.clipboard.writeText(url.toString());
    window.alert('Ссылка скопирована!');
  };

  const requestConnectionDetails = async (values: LocalUserChoices) => {
    setConnecting(true);
    setError(null);

    try {
      const participantName = shouldHideNameField ? profileName : values.username.trim();
      const normalizedValues = { ...values, username: participantName };
      const url = new URL('/api/livekit/connection-details', window.location.origin);

      url.searchParams.set('roomName', roomFromUrl);
      url.searchParams.set('participantName', participantName);

      if (regionFromUrl) {
        url.searchParams.set('region', regionFromUrl);
      }

      const response = await fetch(url.toString());
      const data = await response.json();

      if (!response.ok) {
        throw new Error(translateErrorMessage(data.error || 'Не удалось получить данные комнаты'));
      }

      setPreJoinChoices(normalizedValues);
      setConnectionDetails(data);
    } catch (e: any) {
      console.error(e);
      setError(translateErrorMessage(e.message || 'Не удалось подключиться к комнате'));
    } finally {
      setConnecting(false);
    }
  };

  const startDemoMeeting = () => {
    const nextRoomName = roomName.trim() || generateRoomId();

    resetConferenceState();
    setRoomName(nextRoomName);
    updateSearchState({
      codec: selectedCodec,
      hq: hq ? 'true' : undefined,
      liveKitUrl: undefined,
      region: region.trim() || undefined,
      room: nextRoomName,
      singlePC: undefined,
      token: undefined,
    });
    syncHash(demoE2EE, demoPassphrase);
  };

  const activeRoomConnection = useMemo<MeetingConnectionDetails | undefined>(
    () => connectionDetails,
    [connectionDetails],
  );

  const activeUserChoices = useMemo<LocalUserChoices | undefined>(
    () => preJoinChoices,
    [preJoinChoices],
  );

  if (activeRoomConnection && activeUserChoices) {
    return (
      <>
        <MeetRoom
          connectionDetails={activeRoomConnection}
          copyInviteLink={copyInviteLink}
          debugLogLevel={LogLevel.debug}
          userChoices={activeUserChoices}
          options={{
            codec: selectedCodec,
            hq: hqFromUrl,
            singlePeerConnection: true,
          }}
          onLeave={() => openLanding()}
          onError={(message) => {
            setError(translateErrorMessage(message));
            openLanding({ preserveError: true });
          }}
        />
        <MeetRoomStyles />
        {error && <div className="meet-floating-error">{error}</div>}
      </>
    );
  }

  if (roomFromUrl) {
    return (
      <Flexbox
        align="center"
        height="100%"
        justify="center"
        padding={24}
        style={{ overflowX: 'hidden', overflowY: 'auto' }}
        width="100%"
      >
        <div
          className="meet-prejoin-shell"
          data-hide-name={shouldHideNameField ? 'true' : 'false'}
          style={{ width: '100%' }}
        >
          <div className="meet-prejoin-card">
            <Flexbox className="meet-prejoin-header" gap={10}>
              <Flexbox gap={8}>
                <Title level={3} style={{ margin: 0 }}>
                  Подключение к звонку
                </Title>
                <div className="meet-room-badge">{roomFromUrl}</div>
              </Flexbox>
              {profileName && <div className="meet-inline-badge">{profileName}</div>}
            </Flexbox>

            {error && <div className="meet-error-text">{error}</div>}

            <MeetPreJoin
              camLabel="Камера"
              className="meet-prejoin"
              hideNameField={shouldHideNameField}
              joinLabel={connecting ? 'Подключение...' : JOIN_BUTTON_LABEL}
              key={`${profileName || 'guest'}:${roomFromUrl}`}
              micLabel="Микрофон"
              persistUserChoices={!shouldHideNameField}
              userLabel="Ваше имя"
              defaults={{
                audioEnabled: true,
                username: profileName,
                videoEnabled: true,
              }}
              onMeetError={(e) => setError(translateErrorMessage(e.message))}
              onMeetSubmit={requestConnectionDetails}
              onValidate={(values) => shouldHideNameField || values.username.trim() !== ''}
            />
          </div>
        </div>

        <MeetRoomStyles />
        <MeetPrejoinStyles />
      </Flexbox>
    );
  }

  return (
    <Flexbox align="center" height="100%" justify="center" padding={24}>
      <div className="meet-landing-shell">
        <div className="meet-hero-card">
          <Flexbox horizontal align="center" gap={10} wrap={'wrap'}>
            <Title level={2} style={{ margin: 0 }}>
              Звонки ДОиРП
            </Title>
            <Tag bordered={false} className="meet-beta-badge" style={{ marginInlineEnd: 0 }}>
              beta 1.2
            </Tag>
          </Flexbox>
          <Paragraph className="meet-secondary-text meet-hero-copy" style={{ marginBottom: 0 }}>
            Создайте встречу и отправьте ссылку участникам.
          </Paragraph>
          {profileName && <div className="meet-inline-badge">{`Войдёте как ${profileName}`}</div>}
        </div>

        <div className="meet-landing-card">
          <Title level={4} style={{ marginTop: 0 }}>
            Новая встреча
          </Title>

          <div className="meet-primary-form">
            <div>
              <div className="meet-label">Название встречи</div>
              <Input
                placeholder="Например, doirp-test-room"
                size="large"
                value={roomName}
                onChange={(e) => setRoomName(e.target.value)}
              />
            </div>
            <div className="meet-actions">
              <Button block size="large" type="primary" onClick={startDemoMeeting}>
                Начать встречу
              </Button>
              <Button
                block
                size="large"
                onClick={() => {
                  const nextRoomName = roomName.trim() || generateRoomId();

                  setRoomName(nextRoomName);
                  copyDemoInviteLink(nextRoomName);
                }}
              >
                Скопировать ссылку
              </Button>
            </div>
          </div>

          <Collapse
            bordered={false}
            className="meet-collapse"
            items={[
              {
                children: (
                  <div className="meet-advanced-grid">
                    <div>
                      <div className="meet-label">Кодек видео</div>
                      <Select
                        options={CODEC_OPTIONS}
                        size="large"
                        value={selectedCodec}
                        onChange={(value) => setSelectedCodec(value)}
                      />
                    </div>
                    <div>
                      <div className="meet-label">Регион</div>
                      <Input
                        placeholder="Например, eu-central"
                        size="large"
                        value={region}
                        onChange={(e) => setRegion(e.target.value)}
                      />
                    </div>
                    <div className="meet-switch-field">
                      <div>
                        <div className="meet-label">Высокое качество</div>
                        <div className="meet-secondary-text">
                          Для камер и демонстрации экрана в режиме HQ
                        </div>
                      </div>
                      <Switch checked={hq} onChange={setHq} />
                    </div>
                    <div className="meet-option-box">
                      <Checkbox checked={demoE2EE} onChange={(e) => setDemoE2EE(e.target.checked)}>
                        Сквозное шифрование
                      </Checkbox>
                      {demoE2EE && (
                        <Input.Password
                          placeholder="Введите пароль шифрования"
                          size="large"
                          value={demoPassphrase}
                          onChange={(e) => setDemoPassphrase(e.target.value)}
                        />
                      )}
                    </div>
                  </div>
                ),
                key: 'demo-advanced',
                label: 'Расширенные настройки',
              },
            ]}
          />

          {error && <div className="meet-error-text">{error}</div>}

          {!serverUrl && (
            <div className="meet-warning-text">
              Внимание: не задана переменная `NEXT_PUBLIC_LIVEKIT_URL`
            </div>
          )}
        </div>
      </div>

      <MeetLandingStyles />
      <MeetRoomStyles />
      <MeetPrejoinStyles />
    </Flexbox>
  );
});

const MeetLandingStyles = () => (
  <style>{`
    .meet-landing-shell {
      width: 100%;
      max-width: 760px;
      display: grid;
      gap: 16px;
    }

    .meet-hero-card {
      padding: 24px 26px;
      border-radius: 28px;
      border: 1px solid var(--colorBorderSecondary);
      background:
        radial-gradient(circle at top right, color-mix(in srgb, var(--colorPrimary) 16%, transparent), transparent 38%),
        linear-gradient(145deg, color-mix(in srgb, var(--colorPrimary) 10%, var(--colorBgContainer)) 0%, var(--colorBgContainer) 62%, color-mix(in srgb, var(--colorInfo) 8%, var(--colorBgContainer)) 100%);
      box-shadow: var(--shadow-elevated);
      display: grid;
      gap: 10px;
    }

    .meet-landing-card {
      padding: 24px;
      border-radius: 24px;
      border: 1px solid var(--colorBorderSecondary);
      background: var(--colorBgContainer);
      box-shadow: var(--shadow-elevated);
      display: grid;
      gap: 16px;
    }

    .meet-beta-badge {
      border-radius: 999px;
      padding-inline: 10px;
      background: color-mix(in srgb, #d97706 18%, var(--colorBgContainer)) !important;
      color: #b45309 !important;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.02em;
    }

    .meet-hero-copy {
      max-width: 460px;
    }

    .meet-primary-form {
      display: grid;
      gap: 14px;
    }

    .meet-form-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 16px;
    }

    .meet-advanced-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 16px;
    }

    .meet-form-grid-span-2 {
      grid-column: 1 / -1;
    }

    .meet-label {
      margin-bottom: 8px;
      color: var(--colorTextSecondary);
      font-size: 13px;
      font-weight: 600;
    }

    .meet-secondary-text {
      color: var(--colorTextSecondary);
      font-size: 14px;
      line-height: 1.65;
    }

    .meet-switch-field {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      min-height: 72px;
      padding: 14px 16px;
      border: 1px solid var(--colorBorderSecondary);
      border-radius: 16px;
      background: color-mix(in srgb, var(--colorFillQuaternary) 52%, var(--colorBgContainer));
    }

    .meet-option-box {
      display: grid;
      gap: 12px;
      padding: 16px;
      border-radius: 16px;
      border: 1px solid var(--colorBorderSecondary);
      background: color-mix(in srgb, var(--colorFillQuaternary) 40%, var(--colorBgContainer));
    }

    .meet-actions {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 12px;
    }

    .meet-actions-single {
      grid-template-columns: 1fr;
    }

    .meet-inline-badge {
      align-self: flex-start;
      padding: 8px 12px;
      border-radius: 999px;
      background: color-mix(in srgb, var(--colorSuccess) 12%, var(--colorBgContainer));
      color: var(--colorText);
      font-size: 13px;
      font-weight: 500;
    }

    .meet-room-badge {
      display: inline-flex;
      align-items: center;
      align-self: flex-start;
      min-height: 36px;
      padding: 0 14px;
      border-radius: 999px;
      border: 1px solid color-mix(in srgb, var(--colorPrimary) 22%, var(--colorBorderSecondary));
      background:
        linear-gradient(135deg, color-mix(in srgb, var(--colorPrimary) 14%, var(--colorBgContainer)) 0%, color-mix(in srgb, var(--colorInfo) 10%, var(--colorBgContainer)) 100%);
      color: var(--colorText);
      font-size: 13px;
      font-weight: 700;
      letter-spacing: 0.01em;
      box-shadow: 0 10px 24px color-mix(in srgb, var(--colorPrimary) 12%, transparent);
      max-width: 100%;
      word-break: break-word;
    }

    .meet-error-text {
      color: var(--colorError);
      font-size: 14px;
    }

    .meet-warning-text {
      color: var(--colorWarning);
      font-size: 12px;
    }

    .meet-floating-error {
      position: absolute;
      top: 16px;
      left: 16px;
      z-index: 1001;
      padding: 10px 12px;
      border-radius: 12px;
      background: color-mix(in srgb, var(--colorError) 10%, var(--colorBgContainer));
      border: 1px solid color-mix(in srgb, var(--colorError) 25%, var(--colorBorderSecondary));
      color: var(--colorText);
    }

    .meet-collapse {
      background: transparent;
    }

    .meet-collapse .ant-collapse-item {
      border: 1px solid var(--colorBorderSecondary) !important;
      border-radius: 18px !important;
      overflow: hidden;
      background: color-mix(in srgb, var(--colorFillQuaternary) 30%, var(--colorBgContainer));
    }

    .meet-collapse .ant-collapse-header {
      align-items: center !important;
      min-height: 56px;
      color: var(--colorText) !important;
      font-weight: 600;
    }

    .meet-collapse .ant-collapse-content {
      border-top: 1px solid var(--colorBorderSecondary);
      background: transparent;
    }

    .meet-collapse .ant-collapse-content-box {
      padding-top: 8px !important;
    }

    @media (max-width: 800px) {
      .meet-form-grid,
      .meet-advanced-grid,
      .meet-actions {
        grid-template-columns: 1fr;
      }
    }
  `}</style>
);

const MeetPrejoinStyles = () => (
  <style>{`
    .meet-prejoin-card {
      width: min(100%, 520px);
      margin-inline: auto;
      padding: 24px;
      border: 1px solid var(--colorBorderSecondary);
      border-radius: 24px;
      background: var(--colorBgContainer);
      box-shadow: var(--shadow-elevated);
      display: grid;
      gap: 16px;
    }

    .meet-prejoin-shell {
      display: grid;
      place-items: center;
      width: 100%;
      margin-inline: auto;
      min-height: 100%;
      padding-block: 24px;
    }

    .meet-prejoin {
      width: min(100%, 480px);
      display: grid;
      gap: 16px;
      margin-inline: auto;
    }

    .meet-prejoin-header {
      align-items: center;
      text-align: center;
    }

    .meet-prejoin-video {
      position: relative;
      width: 100%;
      aspect-ratio: 16 / 10;
      max-height: 320px;
      overflow: hidden;
      border-radius: 20px;
      background:
        radial-gradient(circle at top left, color-mix(in srgb, var(--colorPrimary) 10%, transparent), transparent 38%),
        var(--colorFillQuaternary);
      border: 1px solid color-mix(in srgb, var(--colorBorderSecondary) 85%, transparent);
      box-shadow: inset 0 1px 0 color-mix(in srgb, white 14%, transparent);
    }

    .meet-prejoin-video video,
    .meet-prejoin-video-off {
      display: block;
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    .meet-prejoin-video-off {
      display: grid;
      place-items: center;
      background: linear-gradient(180deg, var(--colorFillQuaternary) 0%, var(--colorBgContainer) 100%);
    }

    .meet-prejoin-video-off svg {
      width: 96px;
      height: 96px;
      opacity: 0.72;
    }

    .meet-prejoin-controls {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 14px;
    }

    .meet-prejoin-control-card {
      display: grid;
      gap: 12px;
      padding: 14px;
      border: 1px solid color-mix(in srgb, var(--colorBorderSecondary) 85%, transparent);
      border-radius: 18px;
      background:
        linear-gradient(180deg, color-mix(in srgb, var(--colorBgContainer) 94%, white 6%) 0%, var(--colorBgContainer) 100%);
      box-shadow:
        inset 0 1px 0 color-mix(in srgb, white 18%, transparent),
        0 10px 22px color-mix(in srgb, black 4%, transparent);
    }

    .meet-prejoin-control-card.is-enabled {
      border-color: color-mix(in srgb, var(--colorPrimary) 28%, var(--colorBorderSecondary));
      box-shadow:
        inset 0 1px 0 color-mix(in srgb, white 18%, transparent),
        0 12px 26px color-mix(in srgb, var(--colorPrimary) 10%, transparent);
    }

    .meet-prejoin-control-meta {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 10px;
    }

    .meet-prejoin-control-info {
      overflow: hidden;
      display: grid;
      gap: 6px;
      min-width: 0;
    }

    .meet-prejoin-control-label {
      display: flex;
      align-items: center;
      gap: 8px;
      font-weight: 600;
      color: var(--colorText);
    }

    .meet-prejoin-control-icon {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 32px;
      height: 32px;
      border-radius: 10px;
      background: color-mix(in srgb, var(--colorPrimary) 14%, var(--colorBgContainer));
      color: var(--colorPrimary);
      flex: 0 0 auto;
    }

    .meet-prejoin-control-device {
      overflow: hidden;
      color: var(--colorTextSecondary);
      font-size: 12px;
      line-height: 1.45;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .meet-prejoin-status {
      flex: 0 0 auto;
      padding: 5px 9px;
      border-radius: 999px;
      font-size: 12px;
      font-weight: 600;
    }

    .meet-prejoin-status.is-on {
      background: color-mix(in srgb, var(--colorSuccess) 18%, var(--colorBgContainer));
      color: var(--colorSuccessText, var(--colorSuccess));
    }

    .meet-prejoin-status.is-off {
      background: color-mix(in srgb, var(--colorWarning) 18%, var(--colorBgContainer));
      color: var(--colorWarning);
    }

    .meet-prejoin-control-actions {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(0, 1.1fr);
      gap: 8px;
    }

    .meet-prejoin-control-actions .ant-btn {
      min-height: 44px;
      border-radius: 14px;
      font-weight: 600;
    }

    .meet-prejoin-toggle-button.ant-btn-default {
      border-color: var(--colorBorderSecondary);
      background: var(--colorFillQuaternary);
      color: var(--colorText);
    }

    .meet-prejoin-toggle-button.ant-btn-default:hover {
      border-color: var(--colorPrimaryBorder, var(--colorPrimary));
      background: var(--colorFillSecondary);
      color: var(--colorText);
    }

    .meet-prejoin-toggle-button.ant-btn-primary {
      box-shadow: 0 10px 22px color-mix(in srgb, var(--colorPrimary) 16%, transparent);
    }

    .meet-prejoin-device-button {
      display: inline-flex !important;
      align-items: center;
      justify-content: space-between;
      width: 100%;
      min-width: 0;
      padding-inline: 12px !important;
      border-color: var(--colorBorderSecondary);
      background: transparent;
      color: var(--colorText) !important;
    }

    .meet-prejoin-device-text {
      overflow: hidden;
      max-width: 100%;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .meet-prejoin-name-input,
    .meet-prejoin-submit {
      width: 100%;
    }

    .meet-prejoin-name-input .ant-input,
    .meet-prejoin-name-input.ant-input {
      min-height: 52px;
      border-radius: 16px;
      background: color-mix(in srgb, var(--colorFillQuaternary) 72%, var(--colorBgContainer));
    }

    .meet-prejoin-submit {
      min-height: 56px;
      border-radius: 18px;
      font-weight: 700;
      letter-spacing: 0.01em;
      box-shadow: 0 14px 30px color-mix(in srgb, var(--colorPrimary) 20%, transparent);
    }

    .meet-prejoin-header > div {
      align-items: center;
    }

    @media (max-width: 900px) {
      .meet-prejoin-card {
        padding: 18px;
      }

      .meet-prejoin-shell {
        min-height: auto;
        padding-block: 0 16px;
      }

      .meet-prejoin-video {
        max-height: 280px;
      }

      .meet-prejoin-controls {
        grid-template-columns: 1fr;
      }

      .meet-prejoin-control-actions {
        grid-template-columns: 1fr;
      }
    }
  `}</style>
);

const MeetRoomStyles = () => (
  <style>{`
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

    .lk-control-bar button[data-lk-source='microphone'],
    .lk-control-bar button[data-lk-source='camera'],
    .lk-control-bar button[data-lk-source='screen_share'],
    .lk-control-bar button.lk-chat-toggle,
    .lk-control-bar button.lk-participants-toggle,
    .lk-control-bar button.lk-settings-toggle,
    .lk-control-bar button.lk-disconnect-button {
      font-size: 0 !important;
      gap: 0.625rem;
    }

    .lk-control-bar button[data-lk-source='microphone']::after {
      content: 'Микрофон';
      font-size: 0.75rem;
    }

    .lk-control-bar button[data-lk-source='camera'] .lk-button-label {
      display: none;
    }

    .lk-control-bar button[data-lk-source='camera']::after {
      content: 'Камера';
      font-size: 0.75rem;
    }

    .lk-control-bar button[data-lk-source='screen_share'] .lk-button-label {
      display: none;
    }

    .lk-control-bar button[data-lk-source='screen_share']::after {
      content: 'Экран';
      font-size: 0.75rem;
    }

    .lk-control-bar button.lk-chat-toggle .lk-button-label {
      display: none;
    }

    .lk-control-bar button.lk-chat-toggle::after {
      content: 'Чат';
      font-size: 0.75rem;
    }

    .lk-control-bar button.lk-participants-toggle .lk-button-label {
      display: none;
    }

    .lk-control-bar button.lk-participants-toggle::after {
      content: 'Участники';
      font-size: 0.75rem;
    }

    .lk-control-bar button.lk-settings-toggle .lk-button-label {
      display: none;
    }

    .lk-control-bar button.lk-settings-toggle::after {
      content: 'Настройки';
      font-size: 0.75rem;
    }

    .lk-control-bar button.lk-disconnect-button {
      background-color: var(--colorError) !important;
    }

    .lk-control-bar button.lk-disconnect-button .lk-button-label {
      display: none;
    }

    .lk-control-bar button.lk-disconnect-button::after {
      content: 'Выйти';
      font-size: 0.75rem;
      color: white;
    }

    .lk-chat,
    .lk-settings-menu-modal,
    .lk-participant-panel {
      background-color: var(--colorBgContainer);
      border-left: 1px solid var(--colorBorderSecondary);
    }

    .lk-settings-menu-modal {
      background: var(--colorBgContainer) !important;
      border: 1px solid var(--colorBorderSecondary);
      border-radius: 24px;
      box-shadow: var(--shadow-elevated);
      overflow: hidden;
      padding: 0 !important;
    }

    .lk-settings-menu-modal .settings-menu {
      background: var(--colorBgContainer);
      border-radius: inherit;
      color: var(--colorText);
      min-width: min(720px, calc(100vw - 48px));
      padding: 20px;
    }

    .lk-chat-header {
      visibility: hidden;
      position: relative;
      height: 3rem;
      border-bottom: 1px solid var(--colorBorderSecondary);
    }

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

    .lk-chat-form-controls button {
      color: transparent !important;
      position: relative;
      min-width: 80px;
    }

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

    .lk-chat-form-input::placeholder {
      color: transparent !important;
    }

    .lk-chat-form-input-container {
      position: relative;
    }

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

    .lk-settings-menu-modal h3 {
      color: var(--colorText);
    }

    .lk-settings-menu-modal .lk-button {
      border-radius: 12px;
    }

    .lk-participant-name::after {
      content: ' (вы)';
      display: none;
    }

    .lk-participant-tile[data-lk-local-participant='true'] .lk-participant-name::after {
      display: inline;
    }

    .lk-button[data-lk-source='leave'] {
      font-size: 0 !important;
    }

    .lk-button[data-lk-source='leave']::before {
      content: 'Покинуть';
      font-size: 14px !important;
    }
  `}</style>
);

export default MeetWorkspace;
