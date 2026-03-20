'use client';

import { MediaDeviceMenu, TrackToggle } from '@livekit/components-react';
import { useKrispNoiseFilter } from '@livekit/components-react/krisp';
import { Track } from 'livekit-client';
import React from 'react';

import { isLowPowerDevice } from './client-utils';

export function MicrophoneSettings() {
  const { isNoiseFilterEnabled, isNoiseFilterPending, setNoiseFilterEnabled } = useKrispNoiseFilter(
    {
      filterOptions: {
        bufferDropMs: 200,
        bufferOverflowMs: 100,
        onBufferDrop: () => {
          console.warn(
            'krisp buffer dropped, noise filter versions >= 0.3.2 will automatically disable the filter',
          );
        },
        quality: isLowPowerDevice() ? 'low' : 'medium',
      },
    },
  );

  React.useEffect(() => {
    setNoiseFilterEnabled(!isLowPowerDevice());
  }, [setNoiseFilterEnabled]);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'row',
        gap: 10,
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
      }}
    >
      <section className="lk-button-group">
        <TrackToggle source={Track.Source.Microphone}>Микрофон</TrackToggle>
        <div className="lk-button-group-menu">
          <MediaDeviceMenu kind="audioinput" />
        </div>
      </section>

      <button
        aria-pressed={isNoiseFilterEnabled}
        className="lk-button"
        disabled={isNoiseFilterPending}
        onClick={() => setNoiseFilterEnabled(!isNoiseFilterEnabled)}
      >
        {isNoiseFilterEnabled ? 'Выключить' : 'Включить'} улучшенное шумоподавление
      </button>
    </div>
  );
}
