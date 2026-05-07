// ── CANTRELL CREATIVES VOICE ENGINE (V2.4) ──
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    const url = new URL(request.url);

    // 1. HEALTH CHECK
    if (request.method === 'GET' && url.pathname === '/') {
      return new Response('Cantrell Creatives Platform Engine Active', { headers: corsHeaders });
    }

    // 2. DYNAMIC VOICE LIST
    if (request.method === 'GET' && url.pathname === '/voices') {
      const list = await env.VOICE_SAMPLES.list();
      const voices = list.objects.filter(obj => obj.key.endsWith('.mp3')).map(obj => ({
        name: obj.key.replace('.mp3', ''),
        file: obj.key
      }));
      return new Response(JSON.stringify({ voices }), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    // 3. SAMPLE PREVIEW
    if (request.method === 'GET' && url.pathname === '/sample') {
      const voiceId = url.searchParams.get('voice_id');
      if (!voiceId) return new Response('voice_id required', { status: 400, headers: corsHeaders });
      const file = await env.VOICE_SAMPLES.get(voiceId);
      if (!file) return new Response('File not found', { status: 404, headers: corsHeaders });
      return new Response(file.body, { headers: { 'Content-Type': 'audio/mpeg', ...corsHeaders } });
    }

    // 4. GENERATION ENGINE
    if (request.method === 'POST') {
      try {
        const body = await request.json();
        const text = body.text;
        // This accepts both 'voice_file' and 'voice_id' to prevent 400 errors
        const rawVoice = body.voice_file || body.voice_id;

        if (!text || !rawVoice) {
          return new Response('Missing text or voice', { status: 400, headers: corsHeaders });
        }

        // IMPORTANT: MeloTTS crashes if .mp3 is in the name
        const cleanSpeaker = rawVoice.replace(/\.mp3$/i, '');

        // Use the exact model ID and variable name 'cleanSpeaker'
        const result = await env.AI.run('@cf/myshell-ai/melotts', {
          prompt: text,
          speaker: cleanSpeaker
        });

        // Debug: inspect what MeloTTS actually returns
        const resultType = typeof result;
        const isArrayBuffer = result instanceof ArrayBuffer;
        const isUint8Array = result instanceof Uint8Array;
        const isReadableStream = result instanceof ReadableStream;
        const resultKeys = (result && typeof result === 'object' && !isArrayBuffer && !isUint8Array) ? Object.keys(result) : [];

        // Extract audio from the response
        let audioData = null;
        let contentType = 'audio/wav';

        if (isReadableStream) {
          audioData = result;
        } else if (isArrayBuffer) {
          audioData = result;
        } else if (isUint8Array) {
          audioData = result.buffer;
        } else if (result && typeof result === 'object') {
          // Try known property names from Cloudflare AI models
          audioData = result.audio || result.data || result.wav || result.response || result.output || null;
          if (!audioData) {
            // Return debug info so we know the structure
            return new Response(JSON.stringify({
              error: 'Cannot extract audio from AI response',
              type: resultType,
              keys: resultKeys,
              preview: JSON.stringify(result).substring(0, 500)
            }), {
              status: 500,
              headers: { 'Content-Type': 'application/json', ...corsHeaders }
            });
          }
        }

        if (!audioData) {
          return new Response(JSON.stringify({ error: 'AI returned null/empty', type: resultType }), {
            status: 500,
            headers: { 'Content-Type': 'application/json', ...corsHeaders }
          });
        }

        return new Response(audioData, {
          headers: { 'Content-Type': contentType, ...corsHeaders }
        });
      } catch (err) {
        return new Response(err.message, { status: 500, headers: corsHeaders });
      }
    }

    return new Response('Not Found', { status: 404, headers: corsHeaders });
  }
};
