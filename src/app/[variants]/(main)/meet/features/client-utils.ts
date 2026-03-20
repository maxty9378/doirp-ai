import { type VideoCodec, videoCodecs } from 'livekit-client';

export function encodePassphrase(passphrase: string) {
  return encodeURIComponent(passphrase);
}

export function decodePassphrase(base64String: string) {
  return decodeURIComponent(base64String);
}

export function randomString(length: number): string {
  let result = '';
  const characters = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const charactersLength = characters.length;

  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * charactersLength));
  }

  return result;
}

export function generateRoomId(): string {
  return `${randomString(4)}-${randomString(4)}`;
}

export function isLowPowerDevice() {
  return navigator.hardwareConcurrency < 6;
}

export function isVideoCodec(codec: string): codec is VideoCodec {
  return videoCodecs.includes(codec as VideoCodec);
}
