'use client';

import type { LocalUserChoices } from '@livekit/components-react';
import {
  ParticipantPlaceholder,
  useMediaDevices,
  usePersistentUserChoices,
  usePreviewDevice,
} from '@livekit/components-react';
import { Button, Dropdown, Input } from 'antd';
import { type LocalAudioTrack, type LocalVideoTrack } from 'livekit-client';
import { ChevronDown, Mic, MicOff, Video, VideoOff } from 'lucide-react';
import React from 'react';

type MeetPreJoinProps = React.FormHTMLAttributes<HTMLFormElement> & {
  camLabel?: string;
  defaults?: Partial<LocalUserChoices>;
  hideNameField?: boolean;
  joinLabel?: string;
  micLabel?: string;
  onMeetError?: (error: Error) => void;
  onMeetSubmit?: (values: LocalUserChoices) => void;
  onValidate?: (values: LocalUserChoices) => boolean;
  persistUserChoices?: boolean;
  userLabel?: string;
};

const getDeviceLabel = (devices: MediaDeviceInfo[], deviceId: string, fallback: string) => {
  const device = devices.find((item) => item.deviceId === deviceId);

  if (!device) return fallback;

  return device.label || fallback;
};

export function MeetPreJoin({
  camLabel = 'Камера',
  className,
  defaults = {},
  hideNameField = false,
  joinLabel = 'Присоединиться к звонку',
  micLabel = 'Микрофон',
  onMeetError,
  onMeetSubmit,
  onValidate,
  persistUserChoices = true,
  userLabel = 'Ваше имя',
  ...htmlProps
}: MeetPreJoinProps) {
  const {
    saveAudioInputDeviceId,
    saveAudioInputEnabled,
    saveUsername,
    saveVideoInputDeviceId,
    saveVideoInputEnabled,
    userChoices: initialUserChoices,
  } = usePersistentUserChoices({
    defaults,
    preventLoad: !persistUserChoices,
    preventSave: !persistUserChoices,
  });

  const [audioEnabled, setAudioEnabled] = React.useState(initialUserChoices.audioEnabled);
  const [videoEnabled, setVideoEnabled] = React.useState(initialUserChoices.videoEnabled);
  const [audioDeviceId, setAudioDeviceId] = React.useState(initialUserChoices.audioDeviceId);
  const [videoDeviceId, setVideoDeviceId] = React.useState(initialUserChoices.videoDeviceId);
  const [username, setUsername] = React.useState(initialUserChoices.username);
  const videoElementRef = React.useRef<HTMLVideoElement>(null);

  const audioDevices = useMediaDevices({ kind: 'audioinput', onError: onMeetError });
  const videoDevices = useMediaDevices({ kind: 'videoinput', onError: onMeetError });

  const { deviceError: audioDeviceError } = usePreviewDevice<LocalAudioTrack>(
    audioEnabled,
    audioDeviceId,
    'audioinput',
  );
  const { deviceError: videoDeviceError, localTrack: videoTrack } =
    usePreviewDevice<LocalVideoTrack>(videoEnabled, videoDeviceId, 'videoinput');

  React.useEffect(() => {
    saveAudioInputEnabled(audioEnabled);
  }, [audioEnabled, saveAudioInputEnabled]);

  React.useEffect(() => {
    saveVideoInputEnabled(videoEnabled);
  }, [saveVideoInputEnabled, videoEnabled]);

  React.useEffect(() => {
    saveAudioInputDeviceId(audioDeviceId);
  }, [audioDeviceId, saveAudioInputDeviceId]);

  React.useEffect(() => {
    saveVideoInputDeviceId(videoDeviceId);
  }, [saveVideoInputDeviceId, videoDeviceId]);

  React.useEffect(() => {
    saveUsername(username);
  }, [saveUsername, username]);

  React.useEffect(() => {
    if (audioDeviceError) {
      onMeetError?.(audioDeviceError);
    }
  }, [audioDeviceError, onMeetError]);

  React.useEffect(() => {
    if (videoDeviceError) {
      onMeetError?.(videoDeviceError);
    }
  }, [onMeetError, videoDeviceError]);

  React.useEffect(() => {
    if (!videoElementRef.current || !videoTrack || !videoEnabled) return;

    const videoElement = videoElementRef.current;

    videoTrack.unmute();
    videoTrack.attach(videoElement);

    return () => {
      videoTrack.detach(videoElement);
    };
  }, [videoEnabled, videoTrack]);

  const currentChoices = React.useMemo<LocalUserChoices>(
    () => ({
      audioDeviceId,
      audioEnabled,
      username,
      videoDeviceId,
      videoEnabled,
    }),
    [audioDeviceId, audioEnabled, username, videoDeviceId, videoEnabled],
  );

  const isValid = React.useMemo(() => {
    if (typeof onValidate === 'function') {
      return onValidate(currentChoices);
    }

    return currentChoices.username.trim() !== '';
  }, [currentChoices, onValidate]);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();

    if (!isValid) return;

    onMeetSubmit?.(currentChoices);
  };

  const audioDeviceItems = audioDevices.map((device) => ({
    key: device.deviceId,
    label: device.label || 'Микрофон',
    onClick: () => setAudioDeviceId(device.deviceId),
  }));

  const videoDeviceItems = videoDevices.map((device) => ({
    key: device.deviceId,
    label: device.label || 'Камера',
    onClick: () => setVideoDeviceId(device.deviceId),
  }));

  const currentAudioLabel = getDeviceLabel(audioDevices, audioDeviceId, 'Выбрать микрофон');
  const currentVideoLabel = getDeviceLabel(videoDevices, videoDeviceId, 'Выбрать камеру');

  return (
    <form
      className={`meet-prejoin ${className || ''}`.trim()}
      onSubmit={handleSubmit}
      {...htmlProps}
    >
      <div className="meet-prejoin-video">
        {videoTrack && videoEnabled ? (
          <video data-lk-facing-mode="user" height="720" ref={videoElementRef} width="1280" />
        ) : (
          <div className="meet-prejoin-video-off">
            <ParticipantPlaceholder />
          </div>
        )}
      </div>

      <div className="meet-prejoin-controls">
        <div className={`meet-prejoin-control-card ${audioEnabled ? 'is-enabled' : 'is-disabled'}`}>
          <div className="meet-prejoin-control-meta">
            <div className="meet-prejoin-control-info">
              <div className="meet-prejoin-control-label">
                <span className="meet-prejoin-control-icon">
                  {audioEnabled ? <Mic size={18} /> : <MicOff size={18} />}
                </span>
                <span>{micLabel}</span>
              </div>
              <div className="meet-prejoin-control-device">{currentAudioLabel}</div>
            </div>
            <span className={`meet-prejoin-status ${audioEnabled ? 'is-on' : 'is-off'}`}>
              {audioEnabled ? 'Включён' : 'Выключен'}
            </span>
          </div>
          <div className="meet-prejoin-control-actions">
            <Button
              block
              className="meet-prejoin-toggle-button"
              type={audioEnabled ? 'default' : 'primary'}
              onClick={() => setAudioEnabled((value) => !value)}
            >
              {audioEnabled ? 'Выключить' : 'Включить'}
            </Button>
            <Dropdown
              menu={{ items: audioDeviceItems }}
              placement="bottomRight"
              trigger={['click']}
            >
              <Button className="meet-prejoin-device-button">
                <span className="meet-prejoin-device-text">Устройство</span>
                <ChevronDown size={16} />
              </Button>
            </Dropdown>
          </div>
        </div>

        <div className={`meet-prejoin-control-card ${videoEnabled ? 'is-enabled' : 'is-disabled'}`}>
          <div className="meet-prejoin-control-meta">
            <div className="meet-prejoin-control-info">
              <div className="meet-prejoin-control-label">
                <span className="meet-prejoin-control-icon">
                  {videoEnabled ? <Video size={18} /> : <VideoOff size={18} />}
                </span>
                <span>{camLabel}</span>
              </div>
              <div className="meet-prejoin-control-device">{currentVideoLabel}</div>
            </div>
            <span className={`meet-prejoin-status ${videoEnabled ? 'is-on' : 'is-off'}`}>
              {videoEnabled ? 'Включена' : 'Выключена'}
            </span>
          </div>
          <div className="meet-prejoin-control-actions">
            <Button
              block
              className="meet-prejoin-toggle-button"
              type={videoEnabled ? 'default' : 'primary'}
              onClick={() => setVideoEnabled((value) => !value)}
            >
              {videoEnabled ? 'Выключить' : 'Включить'}
            </Button>
            <Dropdown
              menu={{ items: videoDeviceItems }}
              placement="bottomRight"
              trigger={['click']}
            >
              <Button className="meet-prejoin-device-button">
                <span className="meet-prejoin-device-text">Устройство</span>
                <ChevronDown size={16} />
              </Button>
            </Dropdown>
          </div>
        </div>
      </div>

      {!hideNameField && (
        <Input
          autoComplete="off"
          className="meet-prejoin-name-input"
          placeholder={userLabel}
          size="large"
          value={username}
          onChange={(event) => setUsername(event.target.value)}
        />
      )}

      <Button
        block
        className="meet-prejoin-submit"
        disabled={!isValid}
        htmlType="submit"
        size="large"
        type="primary"
      >
        {joinLabel}
      </Button>
    </form>
  );
}
