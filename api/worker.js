// ── CANTRELL CREATIVES VOICE ENGINE (V3.0 — XTTS/Qwen3) ──
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

// Utility: convert an ArrayBuffer to a base64 string inside a Worker
function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

// Core XTTS generation — fetches reference audio from R2, calls the
// external XTTS/Qwen3 backend, and returns raw audio bytes + content-type.
async function generateWithXTTS(env, text, voiceKey, language) {
  const backendUrl = env.XTTS_BACKEND_URL;
  if (!backendUrl) {
    throw new Error('XTTS_BACKEND_URL not configured');
  }

  // 1. Resolve the R2 key — callers may omit the .mp3 extension
  let r2Key = voiceKey;
  if (!r2Key.endsWith('.mp3')) r2Key += '.mp3';

  // 2. Pull the narrator reference audio from R2
  const refObj = await env.VOICE_SAMPLES.get(r2Key);
  if (!refObj) {
    // Fallback: try the key exactly as provided (covers edge cases)
    const fallback = await env.VOICE_SAMPLES.get(voiceKey);
    if (!fallback) {
      throw new Error('Reference voice not found in R2: ' + r2Key);
    }
    var refBuffer = await fallback.arrayBuffer();
  } else {
    var refBuffer = await refObj.arrayBuffer();
  }

  const refBase64 = arrayBufferToBase64(refBuffer);

  // 3. Build the XTTS/Qwen3 request payload
  //    The payload shape follows the coqui-ai/xtts-streaming-server
  //    and common Qwen3-TTS conventions.  The backend is expected to
  //    accept JSON with base64-encoded reference audio and return raw
  //    audio bytes (wav preferred, mp3 accepted).
  const payload = {
    text: text.substring(0, 4000),
    speaker_wav_base64: refBase64,
    language: language || 'en',
  };

  // 4. POST to the XTTS backend
  const resp = await fetch(backendUrl + '/tts_to_audio', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!resp.ok) {
    const detail = await resp.text().catch(() => '');
    throw new Error(
      'XTTS backend error ' + resp.status + ': ' + detail.substring(0, 300)
    );
  }

  // 5. Read the audio bytes and detect content-type
  const audioBuffer = await resp.arrayBuffer();
  if (!audioBuffer || audioBuffer.byteLength === 0) {
    throw new Error('XTTS backend returned empty audio');
  }

  // Use the backend-reported content-type; fall back to wav
  const ct = resp.headers.get('content-type') || 'audio/wav';

  return { audioBuffer, contentType: ct };
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    const url = new URL(request.url);

    // ── 1. HEALTH CHECK ──
    if (request.method === 'GET' && url.pathname === '/') {
      return new Response(
        JSON.stringify({
          status: 'active',
          engine: 'Cantrell Creatives Voice Engine V3.0 — XTTS/Qwen3',
          xtts_configured: !!env.XTTS_BACKEND_URL,
        }),
        { headers: { 'Content-Type': 'application/json', ...corsHeaders } }
      );
    }

    // ── 2. DYNAMIC VOICE LIST (from R2) ──
    if (request.method === 'GET' && url.pathname === '/voices') {
      const list = await env.VOICE_SAMPLES.list();
      const voices = list.objects
        .filter(obj => obj.key.endsWith('.mp3'))
        .map(obj => ({
          name: obj.key.replace('.mp3', ''),
          file: obj.key,
        }));
      return new Response(JSON.stringify({ voices }), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    // ── 3. SAMPLE PREVIEW (stream reference audio from R2) ──
    if (request.method === 'GET' && url.pathname === '/sample') {
      const voiceId = url.searchParams.get('voice_id');
      if (!voiceId)
        return new Response('voice_id required', {
          status: 400,
          headers: corsHeaders,
        });
      const file = await env.VOICE_SAMPLES.get(voiceId);
      if (!file)
        return new Response('File not found', {
          status: 404,
          headers: corsHeaders,
        });
      return new Response(file.body, {
        headers: { 'Content-Type': 'audio/mpeg', ...corsHeaders },
      });
    }

    // ── 4. TTS PREVIEW (temporary — no persistence) ──
    //    POST /tts-preview  { text, voice_file|voice_id, language? }
    //    Returns raw audio suitable for the frontend <audio> element.
    if (request.method === 'POST' && url.pathname === '/tts-preview') {
      try {
        const body = await request.json();
        const text = body.text;
        const rawVoice = body.voice_file || body.voice_id;
        const language = body.language || 'en';

        if (!text || !rawVoice) {
          return new Response(
            JSON.stringify({ error: 'Missing text or voice' }),
            { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
          );
        }

        const { audioBuffer, contentType } = await generateWithXTTS(
          env, text, rawVoice, language
        );

        return new Response(audioBuffer, {
          headers: {
            'Content-Type': contentType,
            'Content-Length': String(audioBuffer.byteLength),
            ...corsHeaders,
          },
        });
      } catch (err) {
        return new Response(
          JSON.stringify({ error: err.message }),
          { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
        );
      }
    }

    // ── 5. GENERATION ENGINE (full — used by backend & audiobook pipeline) ──
    //    POST /  { text, voice_file|voice_id, format?, language? }
    if (request.method === 'POST' && (url.pathname === '/' || url.pathname === '/generate')) {
      try {
        const body = await request.json();
        const text = body.text;
        const rawVoice = body.voice_file || body.voice_id;
        const language = body.language || 'en';

        if (!text || !rawVoice) {
          return new Response('Missing text or voice', {
            status: 400,
            headers: corsHeaders,
          });
        }

        const { audioBuffer, contentType } = await generateWithXTTS(
          env, text, rawVoice, language
        );

        return new Response(audioBuffer, {
          headers: {
            'Content-Type': contentType,
            'Content-Length': String(audioBuffer.byteLength),
            ...corsHeaders,
          },
        });
      } catch (err) {
        return new Response(
          JSON.stringify({ error: err.message }),
          { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
        );
      }
    }

    return new Response('Not Found', { status: 404, headers: corsHeaders });
  },
};
