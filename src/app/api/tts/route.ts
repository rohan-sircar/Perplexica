import configManager from '@/lib/config';

export const POST = async (req: Request) => {
  try {
    const body: {
      text: string;
      voice?: string;
      model?: string;
      speed?: number;
    } = await req.json();

    if (!body.text) {
      return Response.json(
        { message: 'Text is required.' },
        { status: 400 },
      );
    }

    const ttsConfig = configManager.getCurrentConfig().tts as {
      baseURL?: string;
      apiKey?: string;
      model?: string;
      voice?: string;
      enabled?: boolean;
    } | undefined;

    if (!ttsConfig?.enabled) {
      return Response.json(
        { message: 'TTS is not enabled.' },
        { status: 503 },
      );
    }

    const baseURL = ttsConfig.baseURL || 'https://api.openai.com/v1';
    const apiKey = ttsConfig.apiKey;
    const model = body.model || ttsConfig.model || 'kokoro';
    const voice = body.voice || ttsConfig.voice || 'af_aoede';
    const speed = body.speed ?? 1.0;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (apiKey) {
      headers.Authorization = `Bearer ${apiKey}`;
    }

    // Fetch audio stream from TTS provider in WAV format (streaming RIFF + PCM)
    const ttsResponse = await fetch(`${baseURL}/audio/speech`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model,
        voice,
        input: body.text,
        response_format: 'wav',
        speed,
      }),
    });

    if (!ttsResponse.ok) {
      const errorBody = await ttsResponse.text();
      console.error(`TTS API error: ${ttsResponse.status} ${errorBody}`);
      return Response.json(
        { message: 'TTS generation failed.' },
        { status: 502 },
      );
    }

    const contentType = ttsResponse.headers.get('content-type') || '';
    const stream = ttsResponse.body;

    if (!stream) {
      return Response.json(
        { message: 'No audio stream received.' },
        { status: 502 },
      );
    }

    // Passthrough WAV/PCM directly — upstream already has proper streaming header
    // For MP3, we'd need ffmpeg transcoding (not expected with response_format=wav)
    return new Response(stream, {
      headers: {
        'Content-Type': 'audio/wav',
        'Transfer-Encoding': 'chunked',
      },
    });
  } catch (err) {
    console.error('TTS endpoint error:', err);
    return Response.json(
      { message: 'An error occurred while generating speech.' },
      { status: 500 },
    );
  }
};
