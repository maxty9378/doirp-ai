'use client';

import {
  MediaDeviceMenu,
  type TrackReference,
  TrackToggle,
  useLocalParticipant,
  VideoTrack,
} from '@livekit/components-react';
import { BackgroundBlur, VirtualBackground } from '@livekit/track-processors';
import { isLocalTrack, type LocalTrackPublication, Track } from 'livekit-client';
import React from 'react';

const BACKGROUND_IMAGES = [
  { name: 'Офис', path: '/background-images/samantha-gades-BlIhVfXbi9s-unsplash.jpg' },
  { name: 'Природа', path: '/background-images/ali-kazal-tbw_KQE3Cbg-unsplash.jpg' },
] as const;

type BackgroundType = 'blur' | 'image' | 'none';

export function CameraSettings() {
  const { cameraTrack, localParticipant } = useLocalParticipant();
  const [backgroundType, setBackgroundType] = React.useState<BackgroundType>(
    (cameraTrack as LocalTrackPublication)?.track?.getProcessor()?.name === 'background-blur'
      ? 'blur'
      : (cameraTrack as LocalTrackPublication)?.track?.getProcessor()?.name === 'virtual-background'
        ? 'image'
        : 'none',
  );
  const [virtualBackgroundImagePath, setVirtualBackgroundImagePath] = React.useState<string | null>(
    null,
  );

  const trackRef = React.useMemo<TrackReference | undefined>(() => {
    if (!cameraTrack) return;

    return {
      participant: localParticipant,
      publication: cameraTrack,
      source: Track.Source.Camera,
    };
  }, [cameraTrack, localParticipant]);

  const selectBackground = (type: BackgroundType, imagePath?: string) => {
    setBackgroundType(type);

    if (type === 'image' && imagePath) {
      setVirtualBackgroundImagePath(imagePath);
    } else if (type !== 'image') {
      setVirtualBackgroundImagePath(null);
    }
  };

  React.useEffect(() => {
    if (isLocalTrack(cameraTrack?.track)) {
      if (backgroundType === 'blur') {
        cameraTrack.track?.setProcessor(BackgroundBlur());
      } else if (backgroundType === 'image' && virtualBackgroundImagePath) {
        cameraTrack.track?.setProcessor(VirtualBackground(virtualBackgroundImagePath));
      } else {
        cameraTrack.track?.stopProcessor();
      }
    }
  }, [backgroundType, cameraTrack, virtualBackgroundImagePath]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {trackRef && (
        <VideoTrack
          trackRef={trackRef}
          style={{
            maxHeight: 280,
            objectFit: 'contain',
            objectPosition: 'right',
            transform: 'scaleX(-1)',
            borderRadius: 16,
            background: 'var(--colorBgLayout)',
          }}
        />
      )}

      <section className="lk-button-group">
        <TrackToggle source={Track.Source.Camera}>Камера</TrackToggle>
        <div className="lk-button-group-menu">
          <MediaDeviceMenu kind="videoinput" />
        </div>
      </section>

      <div style={{ marginTop: 10 }}>
        <div style={{ marginBottom: 8 }}>Эффекты фона</div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button
            aria-pressed={backgroundType === 'none'}
            className="lk-button"
            style={{
              border:
                backgroundType === 'none'
                  ? '2px solid var(--colorPrimary)'
                  : '1px solid var(--colorBorderSecondary)',
              minWidth: 80,
            }}
            onClick={() => selectBackground('none')}
          >
            Без фона
          </button>

          <button
            aria-pressed={backgroundType === 'blur'}
            className="lk-button"
            style={{
              border:
                backgroundType === 'blur'
                  ? '2px solid var(--colorPrimary)'
                  : '1px solid var(--colorBorderSecondary)',
              minWidth: 80,
              backgroundColor: '#f0f0f0',
              position: 'relative',
              overflow: 'hidden',
              height: 60,
            }}
            onClick={() => selectBackground('blur')}
          >
            <div
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: '#e0e0e0',
                filter: 'blur(8px)',
                zIndex: 0,
              }}
            />
            <span
              style={{
                position: 'relative',
                zIndex: 1,
                backgroundColor: 'rgba(0,0,0,0.6)',
                color: 'white',
                padding: '2px 5px',
                borderRadius: 4,
                fontSize: 12,
              }}
            >
              Размытие
            </span>
          </button>

          {BACKGROUND_IMAGES.map((image) => (
            <button
              aria-pressed={backgroundType === 'image' && virtualBackgroundImagePath === image.path}
              className="lk-button"
              key={image.path}
              style={{
                backgroundImage: `url(${image.path})`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                width: 80,
                height: 60,
                border:
                  backgroundType === 'image' && virtualBackgroundImagePath === image.path
                    ? '2px solid var(--colorPrimary)'
                    : '1px solid var(--colorBorderSecondary)',
              }}
              onClick={() => selectBackground('image', image.path)}
            >
              <span
                style={{
                  backgroundColor: 'rgba(0,0,0,0.6)',
                  color: 'white',
                  padding: '2px 5px',
                  borderRadius: 4,
                  fontSize: 12,
                }}
              >
                {image.name}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
