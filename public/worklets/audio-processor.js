class AudioProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buffer = new Int16Array(2048);
    this.bufferIndex = 0;
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || !input[0]) return true;
    const channel = input[0];
    let volumeSum = 0;

    for (let i = 0; i < channel.length; i++) {
      const s = Math.max(-1, Math.min(1, channel[i]));
      this.buffer[this.bufferIndex++] = s < 0 ? s * 0x8000 : s * 0x7fff;
      volumeSum += Math.abs(channel[i]);
    }
    // Отправляем пачку данных (2048 сэмплов), когда буфер заполнен
    if (this.bufferIndex >= 2048) {
      const bufferCopy = this.buffer.buffer.slice(0);
      this.port.postMessage(
        {
          buffer: bufferCopy,
          volume: volumeSum / channel.length,
        },
        [bufferCopy],
      );

      this.buffer = new Int16Array(2048);
      this.bufferIndex = 0;
    }
    return true;
  }
}

registerProcessor('audio-processor', AudioProcessor);
