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
        const audioResponse = await env.AI.run('@cf/myshell-ai/melotts', {
          prompt: text,
          speaker: cleanSpeaker
        });

        return new Response(audioResponse, {
          headers: { 'Content-Type': 'audio/mpeg', ...corsHeaders }
        });
      } catch (err) {
        return new Response(err.message, { status: 500, headers: corsHeaders });
      }
    }

    return new Response('Not Found', { status: 404, headers: corsHeaders });
  }
};
