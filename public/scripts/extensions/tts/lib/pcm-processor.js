class PCMProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.samples = [];
    this.readIndex = 0;
    this.buffering = false;
    this.volume = 0.5;
    this.fadeSamples = 720;
    this.fadeIndex = 0;
    this.fadingOut = false;
    this.maxBufferSize = 720000; // ~30s at 24kHz, 16-bit
    this.pendingBytes = new Uint8Array(0);

    this.port.onmessage = (event) => {
      if (event.data.pcmData && !this.buffering) {
        const newData = new Uint8Array(event.data.pcmData);

        // Handle incomplete 16-bit samples at chunk boundaries
        const combined = new Uint8Array(this.pendingBytes.length + newData.length);
        combined.set(this.pendingBytes);
        combined.set(newData, this.pendingBytes.length);

        const completeSamples = Math.floor(combined.length / 2);
        const bytesToProcess = completeSamples * 2;

        if (completeSamples > 0) {
          const int16Array = new Int16Array(combined.buffer.slice(0, bytesToProcess));

          // Check if adding this data would exceed the buffer cap
          const availableSpace = this.maxBufferSize - (this.samples.length - this.readIndex);
          if (int16Array.length > availableSpace) {
            console.warn(`[PCMProcessor] Buffer overflow: ${int16Array.length} samples exceed ${availableSpace} capacity, dropping oldest`);
            // Drop enough samples to make room
            const excess = int16Array.length - availableSpace;
            this.readIndex += excess;
          }

          for (let i = 0; i < int16Array.length; i++) {
            this.samples[this.readIndex + i] = int16Array[i] / 32768.0;
          }
        }

        // Store remainder bytes for next chunk
        if (combined.length > bytesToProcess) {
          this.pendingBytes = combined.slice(bytesToProcess);
        } else {
          this.pendingBytes = new Uint8Array(0);
        }

        // Compact if readIndex has grown too large relative to array length
        const usedLength = this.readIndex + completeSamples;
        if (this.readIndex > this.maxBufferSize * 0.5) {
          const remainingSamples = this.samples.slice(this.readIndex, usedLength);
          this.readIndex = 0;
          this.samples = remainingSamples;
        }
      }

      if (event.data.volume !== undefined) {
        this.volume = Math.max(0, Math.min(2.0, event.data.volume));
      }

      if (event.data.getCount) {
        const bufferLength = this.samples.length - this.readIndex;
        this.port.postMessage({ count: bufferLength });
      }

      if (event.data.flushDone) {
        this.buffering = false;
        this.fadingOut = true;
      }

      if (event.data.resetFade) {
        this.fadeIndex = 0;
        this.fadingOut = false;
      }
    };
  }

  process(inputs, outputs) {
    const output = outputs[0];
    if (output.length > 0 && (this.samples.length - this.readIndex) > 0) {
      const channelData = output[0];
      for (let i = 0; i < channelData.length; i++) {
        if (this.readIndex >= this.samples.length) break;
        const sample = this.samples[this.readIndex++];
        channelData[i] = sample * this.volume;
      }
    }
    return true;
  }
}

registerProcessor('pcm-processor', PCMProcessor);
