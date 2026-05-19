export class StreamingTTSPlayer {
  private audioContext: AudioContext | null = null;
  private audioWorkletNode: AudioWorkletNode | null = null;
  private isStopping = false;
  private abortController: AbortController | null = null;
  isGenerating = false;

  async play(
    text: string,
    options?: { voice?: string; model?: string; speed?: number },
  ): Promise<void> {
    this.stop();

    const ttsConfig = await fetchTTSConfig();
    const voice = options?.voice || ttsConfig.voice;
    const model = options?.model || ttsConfig.model;
    const speed = options?.speed ?? 1.0;
    const introText = ttsConfig.introText;

    this.isGenerating = true;

    try {
      if (introText && introText.trim()) {
        await this.playSegment(introText, voice, model, speed);
      }
      await this.playSegment(text, voice, model, speed);
    } finally {
      this.isGenerating = false;
    }
  }

  private async initAudioWorklet() {
    if (this.audioContext) {
      await this.audioContext.resume();
      return;
    }

    this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({
      sampleRate: 24000,
    });

    const processorUrl = '/scripts/extensions/tts/lib/pcm-processor.js';
    await this.audioContext.audioWorklet.addModule(processorUrl);
    this.audioWorkletNode = new AudioWorkletNode(this.audioContext, 'pcm-processor');
    this.audioWorkletNode.connect(this.audioContext.destination);
    await this.audioContext.resume();
  }

  private waitForDrain(node: AudioWorkletNode, timeoutMs = 10000): Promise<void> {
    return new Promise<void>((resolve) => {
      if (this.isStopping) { resolve(); return; }
      const startTime = Date.now();

      const handler = (event: MessageEvent) => {
        if (event.data.count !== undefined) {
          if (event.data.count === 0) {
            node.port.removeEventListener('message', handler);
            resolve();
          } else {
            setTimeout(() => {
              if (!this.isStopping) {
                node.port.postMessage({ getCount: true });
              }
            }, 30);
          }
        }
      };

      node.port.addEventListener('message', handler);
      node.port.postMessage({ getCount: true });

      setTimeout(() => {
        node.port.removeEventListener('message', handler);
        resolve();
      }, timeoutMs);
    });
  }

  private async playSegment(
    text: string,
    voice: string,
    model: string,
    speed: number,
  ): Promise<void> {
    await this.initAudioWorklet();

    this.abortController = new AbortController();

    // Reset fade counter for new segment
    this.audioWorkletNode!.port.postMessage({ resetFade: true });

    let response;
    try {
      response = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, voice, model, speed }),
        signal: this.abortController.signal,
      });
    } catch (err) {
      if ((err as DOMException).name === 'AbortError') return;
      throw err;
    }

    if (!response.ok) {
      const error = await response.json().catch(() => ({
        message: 'TTS generation failed.',
      }));
      throw new Error(error.message || 'TTS generation failed.');
    }

    let headerParsed = false;
    const reader = response.body!.getReader();

    while (true) {
      if (this.isStopping) return;
      let result: ReadableStreamReadResult<Uint8Array>;
      try {
        result = await reader.read();
      } catch (err) {
        if ((err as DOMException).name === 'AbortError') return;
        throw err;
      }
      const { done, value: chunk } = result;
      if (done) break;

      // Skip WAV header on first chunk only
      const pcmData = headerParsed ? chunk : chunk.slice(44);
      headerParsed = true;

      this.audioWorkletNode!.port.postMessage({ pcmData });
    }

    // Signal worklet that streaming is done
    this.audioWorkletNode!.port.postMessage({ flushDone: true });

    // Wait for all queued samples to drain
    await this.waitForDrain(this.audioWorkletNode!);
  }

  stop(): void {
    this.isStopping = true;

    // Cancel the in-flight fetch request to TTS server
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }

    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
      this.audioWorkletNode = null;
    }

    this.isGenerating = false;
    this.isStopping = false;
  }

  get isPlaying(): boolean {
    return this.isGenerating || (
      this.audioContext !== null && this.audioContext.state !== 'closed'
    );
  }
}

async function fetchTTSConfig(): Promise<{
  voice: string;
  model: string;
  introText: string;
}> {
  try {
    const res = await fetch('/api/config');
    const data = await res.json();
    const tts = (data.values as any)?.tts || {};
    return {
      voice: tts.voice || 'af_aoede',
      model: tts.model || 'kokoro',
      introText: tts.introText || '',
    };
  } catch {
    return { voice: 'af_aoede', model: 'kokoro', introText: '' };
  }
}
