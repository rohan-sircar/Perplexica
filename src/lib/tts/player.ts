type AudioJob = { audioBlob: Blob };

export class StreamingTTSPlayer {
  private audioContext: AudioContext | null = null;
  private audioJobQueue: AudioJob[] = [];
  private currentSource: AudioBufferSourceNode | null = null;
  private currentAudioJob: AudioJob | null = null;
  private audioReady = true;
  private isStopping = false;
  private abortController: AbortController | null = null;
  isGenerating = false;

  async play(
    text: string,
    options?: { voice?: string; model?: string; speed?: number },
  ): Promise<void> {
    await this.stop();
    this.isStopping = false;

    const ttsConfig = await fetchTTSConfig();
    const voice = options?.voice || ttsConfig.voice;
    const model = options?.model || ttsConfig.model;
    const speed = options?.speed ?? 1.0;
    const introText = ttsConfig.introText;
    const segmentLength = Number(ttsConfig.segmentLength) || 200;

    this.isGenerating = true;

    try {
      const content = stripMarkdownHeaders(text);

      const segments: string[] = [];
      if (introText?.trim()) {
        segments.push(...this.splitTextIntoSegments(introText.trim(), segmentLength));
      }
      segments.push(...this.splitTextIntoSegments(content, segmentLength));

      let lastError: Error | null = null;
      for (let i = 0; i < segments.length; i++) {
        if (this.isStopping) return;
        try {
          await this.generateAndQueueAudio(segments[i], voice, model, speed);
          this.processAudioJobQueue();
        } catch (err) {
          lastError = err as Error;
        }
      }

      if (lastError) {
        throw lastError;
      }
    } finally {
      this.isGenerating = false;
    }
  }

  private splitTextIntoSegments(text: string, maxChars: number): string[] {
    const segments: string[] = [];
    if (!text || !text.trim()) return segments;

    const boundaryRegex = /(?<=[.!?]\s)|\n{1,2}/g;
    const parts = text.split(boundaryRegex);

    for (const part of parts) {
      const trimmed = part.trim();
      if (!trimmed) continue;

      if (trimmed.length > maxChars) {
        const words = trimmed.split(/\s+/);
        let current = '';
        for (const word of words) {
          if ((current + ' ' + word).trim().length > maxChars && current.trim()) {
            segments.push(current.trim());
            current = word;
          } else {
            current = current ? current + ' ' + word : word;
          }
        }
        if (current.trim()) {
          segments.push(current.trim());
        }
      } else {
        segments.push(trimmed);
      }
    }

    return segments.filter(s => s.length > 0);
  }

  private async generateAndQueueAudio(
    text: string,
    voice: string,
    model: string,
    speed: number,
  ): Promise<void> {
    this.abortController = new AbortController();

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

    const audioBlob = await response.blob();
    this.audioJobQueue.push({ audioBlob });
  }

  private processAudioJobQueue() {
    if (this.audioJobQueue.length === 0 || !this.audioReady || this.isStopping) {
      return;
    }

    this.audioReady = false;
    this.currentAudioJob = this.audioJobQueue.shift()!;
    this.playAudioBuffer(this.currentAudioJob.audioBlob);
  }

  private async playAudioBuffer(blob: Blob) {
    if (!this.audioContext) {
      this.audioContext = new AudioContext();
    }
    const ctx = this.audioContext;

    const arrayBuffer = await blob.arrayBuffer();
    const audioBuffer = await ctx.decodeAudioData(arrayBuffer);

    const source = ctx.createBufferSource();
    source.buffer = audioBuffer;

    const fadeDuration = 0.03;
    const gainNode = ctx.createGain();
    gainNode.gain.setValueAtTime(1, ctx.currentTime);

    const segmentEnd = audioBuffer.duration - fadeDuration;
    if (segmentEnd > 0) {
      gainNode.gain.linearRampToValueAtTime(1, ctx.currentTime + segmentEnd);
    }
    gainNode.gain.linearRampToValueAtTime(0, ctx.currentTime + audioBuffer.duration);

    source.connect(gainNode).connect(ctx.destination);
    this.currentSource = source;

    source.onended = () => {
      this.currentSource = null;
      this.completeCurrentAudioJob();
    };

    source.start();
  }

  private completeCurrentAudioJob() {
    this.audioReady = true;
    this.currentAudioJob = null;

    if (this.audioJobQueue.length > 0) {
      this.processAudioJobQueue();
    }
  }

  async stop(): Promise<void> {
    this.isStopping = true;

    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }

    if (this.currentSource) {
      try {
        this.currentSource.stop();
      } catch { /* already stopped */ }
      this.currentSource = null;
    }

    this.audioJobQueue.splice(0, this.audioJobQueue.length);
    this.currentAudioJob = null;
    this.audioReady = true;
    this.isGenerating = false;
  }

  get isPlaying(): boolean {
    return this.isGenerating ||
      this.audioJobQueue.length > 0 ||
      this.currentAudioJob !== null ||
      (this.currentSource !== null);
  }
}

async function fetchTTSConfig(): Promise<{
  voice: string;
  model: string;
  introText: string;
  segmentLength: number;
}> {
  try {
    const res = await fetch('/api/config');
    const data = await res.json();
    const tts = (data.values as any)?.tts || {};
    return {
      voice: tts.voice || 'af_aoede',
      model: tts.model || 'kokoro',
      introText: tts.introText || '',
      segmentLength: Number(tts.segmentLength) || 200,
    };
  } catch {
    return { voice: 'af_aoede', model: 'kokoro', introText: '', segmentLength: 200 };
  }
}

function stripMarkdownHeaders(text: string): string {
  return text.replace(/^#+\s+/gm, '');
}
