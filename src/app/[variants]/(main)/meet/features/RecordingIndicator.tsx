'use client';

import { useIsRecording } from '@livekit/components-react';
import * as React from 'react';
import toast from 'react-hot-toast';

export function RecordingIndicator() {
  const isRecording = useIsRecording();
  const [wasRecording, setWasRecording] = React.useState(false);

  React.useEffect(() => {
    if (isRecording !== wasRecording) {
      setWasRecording(isRecording);

      if (isRecording) {
        toast('Этот звонок записывается', {
          className: 'lk-button',
          duration: 3000,
          icon: 'REC',
          position: 'top-center',
          style: {
            backgroundColor: 'var(--colorError)',
            color: 'white',
          },
        });
      }
    }
  }, [isRecording, wasRecording]);

  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        boxShadow: isRecording ? 'var(--colorError) 0 0 0 3px inset' : 'none',
        pointerEvents: 'none',
      }}
    />
  );
}
