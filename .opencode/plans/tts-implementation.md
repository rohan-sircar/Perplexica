---
status: in-progress
phase: 3.1
updated: 2026-05-19
---

# Implementation Plan - Compacted

## Goal
Replace client-side Web Speech API TTS with server-side streaming OpenAI-compatible TTS via `/api/tts` endpoint, with configurable model/voice/baseURL in Settings.

## Context & Decisions
| Decision | Rationale | Source |
|----------|-----------|--------|
| Backend proxy for TTS (`/api/tts`) | Frontend never calls external APIs directly; all provider access goes through backend | `ref:ses_1c931566effeKjnrzm6ZPgFdms` |
| MSE (MediaSource Extensions) for streaming playback | Best approach for progressive audio — no decoding overhead, universal browser support | `ref:ses_1c934447affeVG3KgMBF5771RI` |
| WAV format (`audio/wav`) | Zero decoding overhead, all browsers support it, lowest latency for streaming | `ref:ses_1c934447affeVG3KgMBF5771RI` |
| Server TTS config in `data/config.json` under `tts` section | Follows existing pattern (e.g., `search` section); scope: `server` | `ref:ses_1c9363aecffehG8FWm2zpwRy7a` |
| Auto-narration disabled by default | User preference | user |
| Global settings toggle for auto-narration | Single switch, not per-conversation | user |
| Hardcoded built-in voices + `/voices` endpoint fetch | Built-in voices are documented constants; custom voices need API call | `ref:ses_1c934447affeVG3KgMBF5771RI` |
| Voice select with manual fallback text input | Voice cloning uses non-standard naming formats | user |
| Error toast on TTS failure, continue text generation | User preference — no silent fallback | user |

## Phase 1: Backend TTS Endpoint [DONE]
- [x] **1.1 Create `/api/tts` route** — POST proxy that reads `text`, `voice`, `model` from body, uses configured TTS provider settings, streams audio response via `ReadableStream` with `response_format: 'wav'`, supports optional `streamFormat: 'audio'` for chunked transfer encoding, follows existing proxy pattern (like `/api/weather/route.ts`)
- [x] **1.2 Add TTS config types & defaults** — Added `tts?: { [key: string]: any }` to `Config` type in `types.ts`, added default `tts` object to `ConfigManager.currentConfig`, added `tts` to `UIConfigSections` type

## Phase 2: Settings UI for TTS [DONE]
- [x] **2.1 Define TTS config UI fields** in `config/index.ts` — Switch "Enable TTS" (key: `enabled`, scope: `server`), String "Base URL" (key: `baseURL`, placeholder: `https://api.openai.com/v1`, scope: `server`), Password "API Key" (key: `apiKey`, scope: `server`), Select "Model" (key: `model`, options: `gpt-4o-mini-tts` default, scope: `server`), Async select with fetch "Voice" — loads from `/api/tts/voices` endpoint, falls back to manual text input
- [x] **2.2 Create TTS Settings section component** (`Settings/Sections/TTS.tsx`) — Renders the above fields using existing `SettingsField` pattern, Voice field: select dropdown populated by fetching `/api/tts/voices`, with a text input fallback below
- [x] **2.3 Add `/api/tts/voices` endpoint** — `GET /api/tts/voices` calls `{baseURL}/v1/audio/voices` (or hardcoded built-in list if baseURL not configured), returns `{ voices: [{ id, name, type }] }`
- [x] **2.4 Register TTS section in SettingsDialogue** — Added to `sections` array with icon, component reference, and `dataAdd: 'tts'`

## Phase 3: Frontend Audio Player [IN PROGRESS]
- [ ] **3.1 Create `StreamingTTSPlayer` class** (`src/lib/tts/player.ts`) — Uses MSE (`MediaSource` + `SourceBuffer.appendBuffer()`) for progressive playback, configurable format (`wav`), model, voice, methods: `play(text)`, `stop()`, `get isPlaying()`, handles abort of previous playback before starting new one
- [ ] **3.2 Replace Web Speech API in MessageBox.tsx** — Remove `useSpeech` import and hook usage, use `StreamingTTSPlayer` instance instead, TTS button calls `player.play(speechMessage)` / `player.stop()`, check `tts.enabled` config before showing the button (or disable it)
- [ ] **3.3 Pass TTS config to MessageBox** — Read TTS settings from config via `useChat` or context, need to make config available in ChatWindow/MessageBox tree

## Phase 4: Integration & Polish [PENDING]
- [ ] **4.1 Handle 4096 char limit for TTS text** — Split long text into chunks and queue sequential playback, use MSE buffer queue or collect chunks into single blob per chunk
- [ ] **4.2 Add auto-narration toggle** — Global switch in TTS settings section, when enabled start playing audio automatically when response completes
- [ ] **4.3 Error handling & UX** — Show toast on TTS API errors, disable TTS button visually when config is incomplete, stop audio when navigating away or starting new conversation

## Notes
- 2026-05-17: Research confirmed MSE + WAV is the best combo for streaming TTS in browsers `ref:ses_1c934447affeVG3KgMBF5771RI`
- 2026-05-17: Settings system supports dot-notation keys and auto-creates missing objects, making `tts` section easy to add `ref:ses_1c931566effeKjnrzm6ZPgFdms`
- 2026-05-17: OpenAI `/v1/audio/voices` endpoint returns custom voices; built-in voices are hardcoded constants (alloy, echo, shimmer, nova, verse, etc.) `ref:ses_1c934447affeVG3KgMBF5771RI`
