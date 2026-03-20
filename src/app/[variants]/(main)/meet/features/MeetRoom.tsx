'use client';

import {
  formatChatMessageLinks,
  type LocalUserChoices,
  RoomContext,
  VideoConference,
} from '@livekit/components-react';
import { Button } from 'antd';
import {
  DeviceUnsupportedError,
  ExternalE2EEKeyProvider,
  type LogLevel,
  Room,
  type RoomConnectOptions,
  RoomEvent,
  type RoomOptions,
  type TrackPublishDefaults,
  type VideoCaptureOptions,
  type VideoCodec,
  VideoPresets,
} from 'livekit-client';
import React from 'react';
import { Toaster } from 'react-hot-toast';

import { decodePassphrase } from './client-utils';
import { DebugMode } from './Debug';
import { KeyboardShortcuts } from './KeyboardShortcuts';
import { RecordingIndicator } from './RecordingIndicator';
import { SettingsMenu } from './SettingsMenu';
import { type ConnectionDetails } from './types';
import { useLowCPUOptimizer } from './usePerformanceOptimiser';
import { useSetupE2EE } from './useSetupE2EE';

export type MeetingConnectionDetails = ConnectionDetails;

type MeetRoomProps = {
  connectionDetails: MeetingConnectionDetails;
  copyInviteLink?: () => void;
  debugLogLevel?: LogLevel;
  options?: {
    codec?: VideoCodec;
    hq?: boolean;
    singlePeerConnection?: boolean;
  };
  onError: (error: string) => void;
  onLeave: () => void;
  userChoices: LocalUserChoices;
};

export function MeetRoom({
  connectionDetails,
  copyInviteLink,
  debugLogLevel,
  options,
  onError,
  onLeave,
  userChoices,
}: MeetRoomProps) {
  const keyProvider = React.useMemo(() => new ExternalE2EEKeyProvider(), []);
  const { e2eePassphrase, worker } = useSetupE2EE();
  const e2eeEnabled = Boolean(e2eePassphrase && worker);
  const [e2eeSetupComplete, setE2eeSetupComplete] = React.useState(false);

  const roomOptions = React.useMemo((): RoomOptions => {
    let videoCodec: VideoCodec | undefined = options?.codec || 'vp9';

    if (e2eeEnabled && (videoCodec === 'av1' || videoCodec === 'vp9')) {
      videoCodec = undefined;
    }

    const videoCaptureDefaults: VideoCaptureOptions = {
      deviceId: userChoices.videoDeviceId ?? undefined,
      resolution: options?.hq ? VideoPresets.h2160 : VideoPresets.h720,
    };

    const publishDefaults: TrackPublishDefaults = {
      dtx: false,
      red: !e2eeEnabled,
      videoCodec,
      videoSimulcastLayers: options?.hq
        ? [VideoPresets.h1080, VideoPresets.h720]
        : [VideoPresets.h540, VideoPresets.h216],
    };

    return {
      adaptiveStream: true,
      audioCaptureDefaults: {
        deviceId: userChoices.audioDeviceId ?? undefined,
      },
      dynacast: true,
      e2ee: keyProvider && worker && e2eeEnabled ? { keyProvider, worker } : undefined,
      publishDefaults,
      singlePeerConnection: options?.singlePeerConnection ?? true,
      videoCaptureDefaults,
    };
  }, [
    e2eeEnabled,
    keyProvider,
    options?.codec,
    options?.hq,
    options?.singlePeerConnection,
    userChoices.audioDeviceId,
    userChoices.videoDeviceId,
    worker,
  ]);

  const room = React.useMemo(() => new Room(roomOptions), [roomOptions]);

  React.useEffect(() => {
    if (e2eeEnabled && e2eePassphrase) {
      keyProvider
        .setKey(decodePassphrase(e2eePassphrase))
        .then(() => {
          room.setE2EEEnabled(true).catch((e) => {
            if (e instanceof DeviceUnsupportedError) {
              alert(
                'Вы пытаетесь войти в зашифрованный звонок, но браузер это не поддерживает. Обновите его и попробуйте снова.',
              );
              console.error(e);
            } else {
              throw e;
            }
          });
        })
        .then(() => {
          React.startTransition(() => {
            setE2eeSetupComplete(true);
          });
        });
    } else {
      React.startTransition(() => {
        setE2eeSetupComplete(true);
      });
    }
  }, [e2eeEnabled, e2eePassphrase, keyProvider, room]);

  const connectOptions = React.useMemo<RoomConnectOptions>(
    () => ({
      autoSubscribe: true,
    }),
    [],
  );

  const handleError = React.useCallback(
    (error: Error) => {
      console.error(error);
      onError(error.message);
    },
    [onError],
  );

  const handleEncryptionError = React.useCallback(
    (error: Error) => {
      console.error(error);
      onError(error.message);
    },
    [onError],
  );

  React.useEffect(() => {
    room.on(RoomEvent.Disconnected, onLeave);
    room.on(RoomEvent.EncryptionError, handleEncryptionError);
    room.on(RoomEvent.MediaDevicesError, handleError);

    if (e2eeSetupComplete) {
      room
        .connect(connectionDetails.serverUrl, connectionDetails.participantToken, connectOptions)
        .catch(handleError);

      if (userChoices.videoEnabled) {
        room.localParticipant.setCameraEnabled(true).catch(handleError);
      }

      if (userChoices.audioEnabled) {
        room.localParticipant.setMicrophoneEnabled(true).catch(handleError);
      }
    }

    return () => {
      room.off(RoomEvent.Disconnected, onLeave);
      room.off(RoomEvent.EncryptionError, handleEncryptionError);
      room.off(RoomEvent.MediaDevicesError, handleError);
      room.disconnect();
    };
  }, [
    connectOptions,
    connectionDetails.participantToken,
    connectionDetails.serverUrl,
    e2eeSetupComplete,
    handleEncryptionError,
    handleError,
    onLeave,
    room,
    userChoices.audioEnabled,
    userChoices.videoEnabled,
  ]);

  useLowCPUOptimizer(room);

  return (
    <div className="lk-room-container" data-lk-theme="default" style={{ height: '100%' }}>
      <RoomContext value={room}>
        <KeyboardShortcuts />
        <VideoConference
          SettingsComponent={SettingsMenu}
          chatMessageFormatter={formatChatMessageLinks}
        />
        <DebugMode logLevel={debugLogLevel} />
        <RecordingIndicator />
      </RoomContext>
      <Toaster />

      {copyInviteLink && (
        <div style={{ position: 'absolute', top: 16, right: 16, zIndex: 1000 }}>
          <Button size="small" type="primary" onClick={copyInviteLink}>
            Пригласить
          </Button>
        </div>
      )}
    </div>
  );
}
