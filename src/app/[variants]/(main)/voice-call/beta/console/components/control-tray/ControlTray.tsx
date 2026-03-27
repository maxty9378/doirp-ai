import './control-tray.scss';

import { memo, ReactNode, RefObject, useEffect, useRef, useState } from 'react';

import { useLiveAPIContext } from '../../contexts/LiveAPIContext';
import { UseMediaStreamResult } from '../../hooks/use-media-stream-mux';
import { useScreenCapture } from '../../hooks/use-screen-capture';
import { useWebcam } from '../../hooks/use-webcam';
import { AudioRecorder } from '../../lib/audio-recorder';
import { cx } from '../../lib/cx';
import AudioPulse from '../audio-pulse/AudioPulse';
import SettingsDialog from '../settings-dialog/SettingsDialog';

export type ControlTrayProps = {
  videoRef: RefObject<HTMLVideoElement | null>;
  children?: ReactNode;
  supportsVideo: boolean;
  onVideoStreamChange?: (stream: MediaStream | null) => void;
  enableEditingSettings?: boolean;
};

type MediaStreamButtonProps = {
  isStreaming: boolean;
  onIcon: string;
  offIcon: string;
  start: () => Promise<unknown>;
  stop: () => unknown;
};

const MediaStreamButton = memo(
  ({ isStreaming, offIcon, onIcon, start, stop }: MediaStreamButtonProps) =>
    isStreaming ? (
      <button className="action-button" onClick={stop}>
        <span className="material-symbols-outlined">{onIcon}</span>
      </button>
    ) : (
      <button className="action-button" onClick={start}>
        <span className="material-symbols-outlined">{offIcon}</span>
      </button>
    ),
);

function ControlTray({
  videoRef,
  children,
  enableEditingSettings,
  onVideoStreamChange = () => {},
  supportsVideo,
}: ControlTrayProps) {
  const videoStreams = [useWebcam(), useScreenCapture()];
  const [activeVideoStream, setActiveVideoStream] = useState<MediaStream | null>(null);
  const [webcam, screenCapture] = videoStreams;
  const [inVolume, setInVolume] = useState(0);
  const [audioRecorder] = useState(() => new AudioRecorder());
  const [muted, setMuted] = useState(false);
  const renderCanvasRef = useRef<HTMLCanvasElement>(null);
  const connectButtonRef = useRef<HTMLButtonElement>(null);
  const { client, connect, connected, disconnect, volume } = useLiveAPIContext();

  useEffect(() => {
    if (!connected && connectButtonRef.current) {
      connectButtonRef.current.focus();
    }
  }, [connected]);

  useEffect(() => {
    document.documentElement.style.setProperty(
      '--volume',
      `${Math.max(5, Math.min(inVolume * 200, 8))}px`,
    );
  }, [inVolume]);

  useEffect(() => {
    const onData = (base64: string) => {
      client.sendRealtimeInput([
        {
          mimeType: 'audio/pcm;rate=16000',
          data: base64,
        },
      ]);
    };

    if (connected && !muted) {
      audioRecorder.on('data', onData).on('volume', setInVolume).start();
    } else {
      audioRecorder.stop();
    }

    return () => {
      audioRecorder.off('data', onData).off('volume', setInVolume);
    };
  }, [audioRecorder, client, connected, muted]);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.srcObject = activeVideoStream;
    }

    let timeoutId = -1;

    const sendVideoFrame = () => {
      const video = videoRef.current;
      const canvas = renderCanvasRef.current;

      if (!video || !canvas) return;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      canvas.width = video.videoWidth * 0.25;
      canvas.height = video.videoHeight * 0.25;

      if (canvas.width + canvas.height > 0) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const base64 = canvas.toDataURL('image/jpeg', 1);
        const data = base64.slice(base64.indexOf(',') + 1);
        client.sendRealtimeInput([{ mimeType: 'image/jpeg', data }]);
      }

      if (connected) {
        timeoutId = window.setTimeout(sendVideoFrame, 1000 / 0.5);
      }
    };

    if (connected && activeVideoStream) {
      requestAnimationFrame(sendVideoFrame);
    }

    return () => {
      clearTimeout(timeoutId);
    };
  }, [activeVideoStream, client, connected, videoRef]);

  const changeStreams = (next?: UseMediaStreamResult) => async () => {
    if (next) {
      const mediaStream = await next.start();
      setActiveVideoStream(mediaStream);
      onVideoStreamChange(mediaStream);
    } else {
      setActiveVideoStream(null);
      onVideoStreamChange(null);
    }

    videoStreams
      .filter((streamResult) => streamResult !== next)
      .forEach((streamResult) => streamResult.stop());
  };

  return (
    <section className="control-tray">
      <canvas ref={renderCanvasRef} style={{ display: 'none' }} />

      <nav className={cx('actions-nav', { disabled: !connected })}>
        <button className={cx('action-button mic-button')} onClick={() => setMuted(!muted)}>
          {!muted ? (
            <span className="material-symbols-outlined filled">mic</span>
          ) : (
            <span className="material-symbols-outlined filled">mic_off</span>
          )}
        </button>

        <div className="action-button no-action outlined">
          <AudioPulse active={connected} hover={false} volume={volume} />
        </div>

        {supportsVideo && (
          <>
            <MediaStreamButton
              isStreaming={screenCapture.isStreaming}
              offIcon="present_to_all"
              onIcon="cancel_presentation"
              start={changeStreams(screenCapture)}
              stop={changeStreams()}
            />
            <MediaStreamButton
              isStreaming={webcam.isStreaming}
              offIcon="videocam"
              onIcon="videocam_off"
              start={changeStreams(webcam)}
              stop={changeStreams()}
            />
          </>
        )}

        {children}
      </nav>

      <div className={cx('connection-container', { connected })}>
        <div className="connection-button-container">
          <button
            className={cx('action-button connect-toggle', { connected })}
            onClick={connected ? disconnect : connect}
            ref={connectButtonRef}
          >
            <span className="material-symbols-outlined filled">
              {connected ? 'pause' : 'play_arrow'}
            </span>
          </button>
        </div>
        <span className="text-indicator">Поток</span>
      </div>

      {enableEditingSettings ? <SettingsDialog /> : null}
    </section>
  );
}

export default memo(ControlTray);
