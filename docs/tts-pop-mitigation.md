# TTS Pop Mitigation — Resolution Summary

## Problem
When TTS audio started playing through the AudioWorklet PCM processor, there was an audible "pop" or click caused by a DC discontinuity — the abrupt jump from silence (0) to the first non-zero audio sample.

## Root Cause
The AudioContext and AudioWorklet begin processing immediately upon creation. When the first PCM chunk arrives from the streaming fetch, its initial sample is typically at a non-zero value (e.g., 0.3). The output jumps from 0.0 (silence) to that sample value instantaneously, creating a sharp discontinuity in the waveform that manifests as an audible pop.

## Attempts Made

### Attempt 1: GainNode with linearRampToValueAtTime
Created a fresh GainNode per segment with `gain.value = 0`, then scheduled a linear ramp to 1 over 5–10ms.

**Result:** Did not work. The ramp finished before the first PCM data arrived (network delay > 5ms), so by the time audio started playing, gain was already at 1.0.

### Attempt 2: Pre-fill silence in worklet buffer
Pre-filled 15–50ms of zero samples in the worklet's sample queue before sending PCM data, hoping it would mask the discontinuity.

**Result:** Did not work. The silence just delayed when the pop occurred — the first audio sample still jumped from 0 to its value.

### Attempt 3: GainNode with delayed ramp start
Started the GainNode ramp only after the first PCM chunk arrived, so the fade-in overlapped with actual audio playback.

**Result:** Did not work reliably. The gain scheduling timing was inconsistent with when the audio thread actually processed the samples.

## Final Solution

### Two-part approach in `pcm-processor.js`:

1. **Fade-in counter** — A per-segment sample counter (`fadeIndex`) that tracks how many samples have been output since the segment started.

2. **Cubic power curve** — Instead of a linear fade (gain = normalized), used a cubic power curve:
   ```js
   const normalized = this.fadeIndex / this.fadeSamples;
   gain = Math.pow(normalized, 3);
   ```

3. **Duration** — `fadeSamples = 720` samples at 24kHz = **30ms** of fade-in.

### How it works:
- On each new segment, the fade counter resets to 0 via a `resetFade` message from the player.
- For the first 720 samples output by the worklet, the gain is computed as `(fadeIndex / 720)^3`.
- The cubic curve keeps gain very low for the first ~70% of the fade (gain stays below 0.34), then ramps up more quickly toward the end. This provides a smooth, gradual transition from silence to full volume.

### Files changed:
- `public/scripts/extensions/tts/lib/pcm-processor.js` — Added `fadeSamples`, `fadeIndex`, cubic power curve in `process()`, and `resetFade` message handler
- `src/lib/tts/player.ts` — Sends `resetFade` message at the start of each segment via `playSegment()`
