module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method === 'GET') {
    return res.status(200).json({
      status: 'ok',
      method: req.method,
      hasApiKey: !!process.env.KOKORO_API_KEY,
      keyPrefix: process.env.KOKORO_API_KEY ? process.env.KOKORO_API_KEY.substring(0, 8) + '...' : 'NOT SET',
      timestamp: new Date().toISOString()
    });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed', received: req.method });
  }

  try {
    var body = req.body || {};
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch(e) { body = {}; }
    }

    if (!body.text) {
      return res.status(400).json({ error: 'No text provided', bodyKeys: Object.keys(body) });
    }

    var apiKey = process.env.KOKORO_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'TTS not configured - KOKORO_API_KEY missing' });
    }

    // ── STEP 1: Submit job ──
    var submitBody = {
      model: body.model || 'hexgrad/kokoro-tts/american-english',
      prompt: body.text.substring(0, 2000),   // APIFree uses "prompt", not "input"
      voice: body.voice || 'af_heart'
    };

    var submitRes = await fetch('https://api.apifree.ai/v1/audio/submit', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(submitBody)
    });

    if (!submitRes.ok) {
      var errText = await submitRes.text();
      return res.status(submitRes.status).json({
        error: 'TTS submit failed',
        status: submitRes.status,
        detail: errText.substring(0, 500)
      });
    }

    var submitJson = await submitRes.json();
    var requestId = submitJson.request_id || submitJson.id;

    if (!requestId) {
      return res.status(500).json({
        error: 'No request_id returned from submit',
        response: submitJson
      });
    }

    // ── STEP 2: Poll for result (max 30s, every 1.5s) ──
    var maxAttempts = 20;
    var pollInterval = 1500; // ms
    var audioUrl = null;

    for (var i = 0; i < maxAttempts; i++) {
      await new Promise(function(r){ setTimeout(r, pollInterval); });

      var pollRes = await fetch('https://api.apifree.ai/v1/audio/' + requestId + '/result', {
        method: 'GET',
        headers: { 'Authorization': 'Bearer ' + apiKey }
      });

      if (!pollRes.ok) continue; // keep polling on transient errors

      var pollJson = await pollRes.json();

      if (pollJson.status === 'success' || pollJson.status === 'completed') {
        // audio_list is an array of URLs
        if (pollJson.audio_list && pollJson.audio_list.length > 0) {
          audioUrl = pollJson.audio_list[0];
          break;
        }
        // fallback: some responses put it directly on url or audio_url
        if (pollJson.url) { audioUrl = pollJson.url; break; }
        if (pollJson.audio_url) { audioUrl = pollJson.audio_url; break; }
      }

      if (pollJson.status === 'failed' || pollJson.status === 'error') {
        return res.status(500).json({ error: 'TTS job failed', detail: pollJson });
      }
      // status === 'pending' / 'processing' → keep polling
    }

    if (!audioUrl) {
      return res.status(504).json({ error: 'TTS timed out waiting for audio', requestId: requestId });
    }

    // ── STEP 3: Fetch the audio and stream it back ──
    var audioRes = await fetch(audioUrl);
    if (!audioRes.ok) {
      return res.status(502).json({ error: 'Failed to fetch audio from CDN', url: audioUrl });
    }

    var audioBuffer = Buffer.from(await audioRes.arrayBuffer());
    res.setHeader('Content-Type', 'audio/wav');
    return res.status(200).send(audioBuffer);

  } catch (e) {
    return res.status(500).json({
      error: 'Server error',
      message: e.message,
      stack: e.stack ? e.stack.substring(0, 300) : ''
    });
  }
};