import type {
  isVideoTrack,
  type LocalVideoTrack,
  ParticipantEvent,
  type RemoteTrack,
  type RemoteTrackPublication,
  Room,
  RoomEvent,
  VideoQuality,
} from 'livekit-client';
import * as React from 'react';

export type LowCPUOptimizerOptions = {
  disableVideoProcessing: boolean;
  reducePublisherVideoQuality: boolean;
  reduceSubscriberVideoQuality: boolean;
};

const defaultOptions: LowCPUOptimizerOptions = {
  disableVideoProcessing: false,
  reducePublisherVideoQuality: true,
  reduceSubscriberVideoQuality: true,
};

export function useLowCPUOptimizer(room: Room, options: Partial<LowCPUOptimizerOptions> = {}) {
  const [lowPowerMode, setLowPowerMode] = React.useState(false);
  const opts = React.useMemo(() => ({ ...defaultOptions, ...options }), [options]);

  React.useEffect(() => {
    const handleCpuConstrained = async (track: LocalVideoTrack) => {
      setLowPowerMode(true);

      if (opts.reducePublisherVideoQuality) {
        track.prioritizePerformance();
      }

      if (opts.disableVideoProcessing && isVideoTrack(track)) {
        track.stopProcessor();
      }

      if (opts.reduceSubscriberVideoQuality) {
        room.remoteParticipants.forEach((participant) => {
          participant.videoTrackPublications.forEach((publication) => {
            publication.setVideoQuality(VideoQuality.LOW);
          });
        });
      }
    };

    room.localParticipant.on(ParticipantEvent.LocalTrackCpuConstrained, handleCpuConstrained);

    return () => {
      room.localParticipant.off(ParticipantEvent.LocalTrackCpuConstrained, handleCpuConstrained);
    };
  }, [
    opts.disableVideoProcessing,
    opts.reducePublisherVideoQuality,
    opts.reduceSubscriberVideoQuality,
    room,
  ]);

  React.useEffect(() => {
    const lowerQuality = (_: RemoteTrack, publication: RemoteTrackPublication) => {
      publication.setVideoQuality(VideoQuality.LOW);
    };

    if (lowPowerMode && opts.reduceSubscriberVideoQuality) {
      room.on(RoomEvent.TrackSubscribed, lowerQuality);
    }

    return () => {
      room.off(RoomEvent.TrackSubscribed, lowerQuality);
    };
  }, [lowPowerMode, opts.reduceSubscriberVideoQuality, room]);

  return lowPowerMode;
}
