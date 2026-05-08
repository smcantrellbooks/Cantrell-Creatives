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

// Build a multipart/form-data body from parts array inside a Worker.
// Each part: { name, value, filename?, contentType? }
// Returns { body: Uint8Array, contentType: string }
function buildMultipart(parts) {
  const boundary = '----CFWorkerBoundary' + Date.now().toString(36);
  const encoder = new TextEncoder();
  const chunks = [];

  for (const part of parts) {
    let header = '--' + boundary + '\r\n';
    if (part.filename) {
      header += 'Content-Disposition: form-data; name="' + part.name + '"; filename="' + part.filename + '"\r\n';
      header += 'Content-Type: ' + (part.contentType || 'application/octet-stream') + '\r\n';
    } else {
      header += 'Content-Disposition: form-data; name="' + part.name + '"\r\n';
    }
    header += '\r\n';
    chunks.push(encoder.encode(header));

    if (part.value instanceof ArrayBuffer || part.value instanceof Uint8Array) {
      chunks.push(part.value instanceof Uint8Array ? part.value : new Uint8Array(part.value));
    } else {
      chunks.push(encoder.encode(String(part.value)));
    }
    chunks.push(encoder.encode('\r\n'));
  }
  chunks.push(encoder.encode('--' + boundary + '--\r\n'));

  let totalLen = 0;
  for (const c of chunks) totalLen += c.byteLength;
  const body = new Uint8Array(totalLen);
  let offset = 0;
  for (const c of chunks) { body.set(c, offset); offset += c.byteLength; }

  return { body, contentType: 'multipart/form-data; boundary=' + boundary };
}

// Core generation — fetches reference audio from R2, calls the external
// Qwen3-TTS / XTTS backend, and returns raw audio bytes + content-type.
//
// Env vars used:
//   XTTS_BACKEND_URL  — base URL of the TTS backend (required)
//   XTTS_ENDPOINT     — path appended to the base URL (default: /tts_to_audio)
//   XTTS_MODE         — "multipart" (default) or "json"
//                        multipart: sends speaker_wav as file upload
//                        json: sends speaker_wav_base64 in JSON body
async function generateWithXTTS(env, text, voiceKey, language) {
  const backendUrl = env.XTTS_BACKEND_URL;
  if (!backendUrl) {
    throw new Error('XTTS_BACKEND_URL not configured');
  }

  const endpointPath = env.XTTS_ENDPOINT || '/tts_to_audio';
  const mode = (env.XTTS_MODE || 'multipart').toLowerCase();

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

  const url = backendUrl.replace(/\/+$/, '') + endpointPath;
  let resp;

  if (mode === 'json') {
    // JSON mode — base64-encoded reference audio (XTTS-streaming-server style)
    const refBase64 = arrayBufferToBase64(refBuffer);
    const payload = {
      text: text.substring(0, 4000),
      speaker_wav_base64: refBase64,
      language: language || 'en',
    };
    resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } else {
    // Multipart mode (default) — Qwen3-TTS / generic TTS server style
    // Sends the reference audio as a file upload field "speaker_wav"
    const { body, contentType } = buildMultipart([
      { name: 'text', value: text.substring(0, 4000) },
      { name: 'language', value: language || 'en' },
      { name: 'speaker_wav', value: refBuffer, filename: r2Key, contentType: 'audio/mpeg' },
    ]);
    resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': contentType },
      body: body,
    });
  }

  if (!resp.ok) {
    const detail = await resp.text().catch(() => '');
    throw new Error(
      'TTS backend error ' + resp.status + ': ' + detail.substring(0, 300)
    );
  }

  // Read the audio bytes and detect content-type
  const audioBuffer = await resp.arrayBuffer();
  if (!audioBuffer || audioBuffer.byteLength === 0) {
    throw new Error('TTS backend returned empty audio');
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
