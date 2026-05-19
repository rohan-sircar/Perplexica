# TTS Audio Fade-In / Fade-Out — Pop Mitigation

## Problem
Audible pops or clicks at audio segment boundaries caused by DC discontinuities — abrupt jumps between silence (0) and non-zero sample values.

### Pop at segment start
The first PCM sample from the TTS server is typically at a non-zero value (e.g., 0.3). The output jumps from 0.0 to that value instantaneously, creating a sharp waveform discontinuity.

### Pop at segment end
When streaming stops and the sample queue drains, the last sample cuts to silence abruptly. Same discontinuity, reversed direction.

## Root Cause
The AudioWorklet `process()` callback outputs samples directly to the audio bus. Any instantaneous jump in sample value (0 -> N or N -> 0) creates a high-frequency transient that the speaker reproduces as a pop.

## Failed Attempts (Fade-In)

### GainNode with linearRampToValueAtTime
Scheduled a gain ramp from 0 to 1 over 5–10ms per segment. **Failed** — network delay exceeded ramp duration, so gain was already at 1.0 when audio arrived.

### Pre-fill silence in worklet buffer
Queued 15–50ms of zero samples before PCM data. **Failed** — only delayed the pop, didn't eliminate the discontinuity.

### GainNode with delayed ramp start
Started ramp after first chunk arrived. **Failed** — gain scheduling timing was inconsistent with audio thread processing.

## Solution: Per-Sample Fade Curve in AudioWorklet

Apply a smooth gain curve to samples at segment boundaries, computed sample-by-sample inside `process()`. This guarantees the fade aligns with actual audio output timing.

### Fade-In (segment start)
```js
if (this.fadeIndex < this.fadeSamples) {
  const normalized = this.fadeIndex / this.fadeSamples;
  gain = Math.pow(normalized, 3);
  this.fadeIndex++;
}
```

### Fade-Out (segment end)
```js
else if (this.fadingOut && this.samples.length < this.fadeSamples) {
  const normalized = this.samples.length / this.fadeSamples;
  gain = Math.pow(normalized, 3);
}
```

### Parameters
| Parameter | Value | Rationale |
|---|---|---|
| `fadeSamples` | 720 | 30ms at 24kHz — long enough to be inaudible, short enough to not delay playback |
| Curve | Cubic (`x^3`) | Keeps gain very low for the first ~70% of the fade (below 0.34), then ramps quickly. Smoother than linear, less aggressive than higher-order curves. |

### How It Works

**Fade-in:** On each new segment, `resetFade` message resets `fadeIndex` to 0 and clears `fadingOut`. For the first 720 output samples, gain follows `(i / 720)^3`, rising from 0.0 to 1.0.

**Fade-out:** When `flushDone` is posted (streaming complete), `fadingOut` is set to true. As the sample queue drains below 720 remaining samples, gain follows `(remaining / 720)^3`, falling from 1.0 to 0.0.

### When to Apply

| Situation | Fade-in | Fade-out |
|---|---|---|
| Single TTS segment | Yes | Yes |
| Intro text + content (two segments) | Yes on each | Yes on intro, yes on content |
| Stopped mid-playback | N/A (audio context closes) | No needed (context close handles it) |

### When NOT to Apply
- **Between concatenated segments from the same source** — if two chunks are part of one continuous audio stream (no silence gap between them), fading would create an unnatural dip. Only fade at logical segment boundaries (intro -> content, or content -> end).

## Files
- `public/scripts/extensions/tts/lib/pcm-processor.js` — Fade-in/fade-out gain logic in `process()`, `resetFade` and `flushDone` message handlers
- `src/lib/tts/player.ts` — Sends `resetFade` at segment start, `flushDone` at segment end
