class PCMProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.samples = [];
    this.buffering = false;
    this.volume = 0.5;
    this.fadeSamples = 720;
    this.fadeIndex = 0;
    this.fadingOut = false;

    this.port.onmessage = (event) => {
      if (event.data.pcmData && !this.buffering) {
        const newData = new Uint8Array(event.data.pcmData);
        const int16Array = new Int16Array(newData.buffer, newData.byteOffset, newData.byteLength / 2);
        for (let i = 0; i < int16Array.length; i++) {
          this.samples.push(int16Array[i] / 32768.0);
        }
      }

      if (event.data.volume !== undefined) {
        this.volume = Math.max(0, Math.min(2.0, event.data.volume));
      }

      if (event.data.getCount) {
        this.port.postMessage({ count: this.samples.length });
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
    if (output.length > 0 && this.samples.length > 0) {
      const channelData = output[0];
      for (let i = 0; i < channelData.length; i++) {
        if (this.samples.length === 0) break;
        const sample = this.samples.shift();
        let gain = 1.0;
        if (this.fadeIndex < this.fadeSamples) {
          const normalized = this.fadeIndex / this.fadeSamples;
          gain = Math.pow(normalized, 3);
          this.fadeIndex++;
        } else if (this.fadingOut && this.samples.length < this.fadeSamples) {
          const normalized = this.samples.length / this.fadeSamples;
          gain = Math.pow(normalized, 3);
        }
        channelData[i] = sample * gain * this.volume;
      }
    }
    return true;
  }
}

registerProcessor('pcm-processor', PCMProcessor);
