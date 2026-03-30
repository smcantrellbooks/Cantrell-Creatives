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
    var requestBody = {
      model: body.model || 'hexgrad/kokoro-tts/american-english',
      input: body.text.substring(0, 2000),
      voice: body.voice || 'af_heart'
    };
    var upstream = await fetch('https://api.apifree.ai/v1/audio/speech', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });
    if (!upstream.ok) {
      var errText = await upstream.text();
      return res.status(upstream.status).json({
        error: 'TTS API error',
        status: upstream.status,
        detail: errText.substring(0, 500),
        requestSent: requestBody
      });
    }
    var audioBuffer = Buffer.from(await upstream.arrayBuffer());
    res.setHeader('Content-Type', 'audio/wav');
    return res.status(200).send(audioBuffer);
  } catch (e) {
    return res.status(500).json({ error: 'Server error', message: e.message, stack: e.stack ? e.stack.substring(0, 300) : '' });
  }
};
