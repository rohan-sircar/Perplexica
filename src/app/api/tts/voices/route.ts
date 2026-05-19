import configManager from '@/lib/config';

const KOKORO_VOICES = [
  // Female voices
  { id: 'af_alloy', name: 'Alloy (Female)', type: 'built-in' },
  { id: 'af_aoede', name: 'Aoede (Female)', type: 'built-in' },
  { id: 'af_bella', name: 'Bella (Female)', type: 'built-in' },
  { id: 'af_heart', name: 'Heart (Female)', type: 'built-in' },
  { id: 'af_jadzia', name: 'Jadzia (Female)', type: 'built-in' },
  { id: 'af_jessica', name: 'Jessica (Female)', type: 'built-in' },
  { id: 'af_kore', name: 'Kore (Female)', type: 'built-in' },
  { id: 'af_nicole', name: 'Nicole (Female)', type: 'built-in' },
  { id: 'af_nova', name: 'Nova (Female)', type: 'built-in' },
  { id: 'af_river', name: 'River (Female)', type: 'built-in' },
  { id: 'af_sarah', name: 'Sarah (Female)', type: 'built-in' },
  { id: 'af_sky', name: 'Sky (Female)', type: 'built-in' },
  // Male voices
  { id: 'am_adam', name: 'Adam (Male)', type: 'built-in' },
  { id: 'am_echo', name: 'Echo (Male)', type: 'built-in' },
  { id: 'am_eric', name: 'Eric (Male)', type: 'built-in' },
  { id: 'am_fenrir', name: 'Fenrir (Male)', type: 'built-in' },
  { id: 'am_liam', name: 'Liam (Male)', type: 'built-in' },
  { id: 'am_michael', name: 'Michael (Male)', type: 'built-in' },
  { id: 'am_onyx', name: 'Onyx (Male)', type: 'built-in' },
  { id: 'am_puck', name: 'Puck (Male)', type: 'built-in' },
  { id: 'am_santa', name: 'Santa (Male)', type: 'built-in' },
  // Other voices
  { id: 'bf_alice', name: 'Alice (Female)', type: 'built-in' },
  { id: 'bf_emma', name: 'Emma (Female)', type: 'built-in' },
  { id: 'bf_lily', name: 'Lily (Female)', type: 'built-in' },
  { id: 'bm_daniel', name: 'Daniel (Male)', type: 'built-in' },
  { id: 'bm_fable', name: 'Fable (Male)', type: 'built-in' },
  { id: 'bm_george', name: 'George (Male)', type: 'built-in' },
];

export const GET = async (req: Request) => {
  try {
    const ttsConfig = configManager.getCurrentConfig().tts as {
      baseURL?: string;
      apiKey?: string;
      model?: string;
    } | undefined;

    if (!ttsConfig?.baseURL) {
      return Response.json({ voices: KOKORO_VOICES });
    }

    try {
      const model = ttsConfig.model || 'kokoro';
      const url = `${ttsConfig.baseURL}/audio/voices?model=${encodeURIComponent(model)}`;

      const headers: Record<string, string> = {};
      if (ttsConfig.apiKey) {
        headers.Authorization = `Bearer ${ttsConfig.apiKey}`;
      }

      const response = await fetch(url, { headers });

      if (!response.ok) {
        console.warn(
          `Voices endpoint returned ${response.status}, falling back to built-in voices`,
        );
        return Response.json({ voices: KOKORO_VOICES });
      }

      const data = await response.json();
      const rawVoices = data.voices || data.data || [];
      const apiVoices = rawVoices.map((v: any) => {
        if (typeof v === 'string') {
          return { id: v, name: v.replace(/\.wav$/i, '').replace(/_/g, ' '), type: 'custom' };
        }
        return {
          id: v.id,
          name: v.name || v.id,
          type: v.type || 'custom',
        };
      });

      if (apiVoices.length > 0) {
        return Response.json({ voices: apiVoices });
      }

      return Response.json({ voices: KOKORO_VOICES });
    } catch {
      return Response.json({ voices: KOKORO_VOICES });
    }
  } catch (err) {
    console.error('Voices endpoint error:', err);
    return Response.json({ voices: KOKORO_VOICES });
  }
};
