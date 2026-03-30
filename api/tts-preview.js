module.exports = async function handler(req, res) {
  // CORS headers on every response
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    var body = req.body;
    if (!body || !body.text) return res.status(400).json({ error: 'No text provided' });

    var apiKey = process.env.KOKORO_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'TTS not configured - KOKORO_API_KEY missing' });

    var upstream = await fetch('https://api.apifree.ai/v1/audio/speech', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: body.model || 'hexgrad/kokoro-tts/american-english',
        input: body.text.substring(0, 2000),
        voice: body.voice || 'af_heart'
      })
    });

    if (!upstream.ok) {
      var errText = await upstream.text();
      return res.status(upstream.status).json({ error: 'TTS API error', status: upstream.status, detail: errText.substring(0, 500) });
    }

    var audioBuffer = Buffer.from(await upstream.arrayBuffer());
    res.setHeader('Content-Type', 'audio/wav');
    return res.status(200).send(audioBuffer);
  } catch (e) {
    return res.status(500).json({ error: 'Server error', message: e.message });
  }
};
