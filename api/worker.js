export default {
  async fetch(request, env) {
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });

    const url = new URL(request.url);

    // ── 1. DYNAMIC VOICE LIST (No IDs needed) ──
    if (url.pathname === '/voices') {
      const list = await env.VOICE_SAMPLES.list();
      const voices = list.objects.map(obj => ({
        name: obj.key.replace('.mp3', ''),
        file: obj.key
      }));
      return new Response(JSON.stringify({ voices }), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    // ── 2. SAMPLE PLAYBACK (Streams MP3 from R2) ──
    if (url.pathname === '/sample' && request.method === 'GET') {
      const voiceId = url.searchParams.get('voice_id');
      if (!voiceId) {
        return new Response(JSON.stringify({ error: 'Missing voice_id parameter' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }
      const object = await env.VOICE_SAMPLES.get(voiceId);
      if (!object) {
        return new Response(JSON.stringify({ error: 'Voice sample not found', voice_id: voiceId }), {
          status: 404,
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }
      return new Response(object.body, {
        headers: {
          'Content-Type': 'audio/mpeg',
          'Content-Length': object.size,
          'Cache-Control': 'public, max-age=86400',
          ...corsHeaders
        }
      });
    }

    // ── 3. THE ENGINE (MeloTTS + Your R2 Voice) ──
    if (request.method === 'POST') {
      const { text, voice_file } = await request.json();

      // Uses Cloudflare's GPU engine
      const audioResponse = await env.AI.run('@cf/myshell/melotts', {
        text: text,
        speaker: voice_file // Uses the actual file from your R2 as the reference
      });

      return new Response(audioResponse, {
        headers: { 'Content-Type': 'audio/mpeg', ...corsHeaders }
      });
    }

    return new Response('Cantrell Creatives Platform Engine Active', { headers: corsHeaders });
  }
};
