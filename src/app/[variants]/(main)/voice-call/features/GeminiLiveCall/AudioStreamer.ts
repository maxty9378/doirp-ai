export class AudioStreamer {
  private context: AudioContext;
  private nextPlayTime: number = 0;
  private sampleRate: number = 24_000;
  public analyser: AnalyserNode;
  public isPlaying: boolean = false;
  public onPlayStateChange?: (playing: boolean) => void;
  private activeNodes: AudioBufferSourceNode[] = [];

  constructor(context: AudioContext) {
    this.context = context;
    this.analyser = this.context.createAnalyser();
    this.analyser.fftSize = 256;
    this.analyser.smoothingTimeConstant = 0.8;
    this.analyser.connect(this.context.destination);
  }

  addPCM16(base64Data: string): void {
    try {
      const binary = atob(base64Data);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

      const numSamples = Math.floor(bytes.length / 2);
      const pcm16 = new Int16Array(bytes.buffer, 0, numSamples);
      const audioBuffer = this.context.createBuffer(1, pcm16.length, this.sampleRate);
      const channelData = audioBuffer.getChannelData(0);

      for (let i = 0; i < pcm16.length; i++) {
        channelData[i] = pcm16[i] / 32768.0;
      }
      this.scheduleBuffer(audioBuffer);
    } catch (e) {
      console.error('AudioStreamer decode error:', e);
    }
  }

  private scheduleBuffer(buffer: AudioBuffer): void {
    if (this.context.state === 'suspended') this.context.resume();

    if (this.nextPlayTime < this.context.currentTime) {
      this.nextPlayTime = this.context.currentTime + 0.05;
    }
    const source = this.context.createBufferSource();
    source.buffer = buffer;
    source.connect(this.analyser);
    source.start(this.nextPlayTime);
    this.activeNodes.push(source);
    if (!this.isPlaying) {
      this.isPlaying = true;
      this.onPlayStateChange?.(true);
    }

    source.onended = () => {
      this.activeNodes = this.activeNodes.filter((n) => n !== source);
      if (this.activeNodes.length === 0) {
        this.isPlaying = false;
        this.onPlayStateChange?.(false);
      }
    };
    this.nextPlayTime += buffer.duration;
  }

  stop(): void {
    this.activeNodes.forEach((node) => {
      try {
        node.stop();
      } catch (_) {}
    });
    this.activeNodes = [];
    this.nextPlayTime = 0;
    this.isPlaying = false;
    this.onPlayStateChange?.(false);
  }
}
