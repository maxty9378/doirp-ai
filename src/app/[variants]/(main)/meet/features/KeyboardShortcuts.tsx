'use client';

import { useTrackToggle } from '@livekit/components-react';
import { Track } from 'livekit-client';
import { useEffect } from 'react';

export function KeyboardShortcuts() {
  const { toggle: toggleMic } = useTrackToggle({ source: Track.Source.Microphone });
  const { toggle: toggleCamera } = useTrackToggle({ source: Track.Source.Camera });

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if (toggleMic && event.key.toLowerCase() === 'a' && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        toggleMic();
      }

      if (toggleCamera && event.key.toLowerCase() === 'v' && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        toggleCamera();
      }
    };

    window.addEventListener('keydown', handleShortcut);

    return () => window.removeEventListener('keydown', handleShortcut);
  }, [toggleCamera, toggleMic]);

  return null;
}
