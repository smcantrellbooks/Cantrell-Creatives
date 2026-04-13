/**
 * POST /api/generate-cover
 *
 * Accepts book metadata and optional style preferences, builds a structured
 * prompt, and routes the image generation request through the Nyxen worker
 * at nyxen-video-worker.smcantrellbooks.workers.dev which already has the
 * OpenAI API keys configured.
 *
 * Expected body (JSON):
 *   title        - string (required)
 *   author       - string (required)
 *   category     - string (required)
 *   style        - string (optional)  e.g. "illustrated", "photographic"
 *   mood         - string (optional)  e.g. "dramatic", "romantic"
 *   subject      - string (optional)  free-text imagery description
 *   colorTheme   - string (optional)  e.g. "gold and black"
 *
 * Returns { images: [url, url, ...] }
 */

const NYXEN_WORKER = 'https://nyxen-video-worker.smcantrellbooks.workers.dev';

module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { title, author, category, style, mood, subject, colorTheme } = req.body || {};

    if (!title || !author) {
      return res.status(400).json({ error: 'Title and author are required.' });
    }

    const prompt = buildPrompt({ title, author, category, style, mood, subject, colorTheme });
    const numImages = 4;

    let images;

    try {
      images = await generateViaWorker(prompt, numImages);
    } catch (workerErr) {
      console.error('[generate-cover] Worker error, falling back to placeholders:', workerErr.message);
      images = generatePlaceholders(title, author, category, numImages);
    }

    return res.status(200).json({ images });
  } catch (err) {
    console.error('[generate-cover] Error:', err);
    return res.status(500).json({ error: 'Cover generation failed. Please try again.' });
  }
};

/* ---------- Prompt builder ---------- */

function buildPrompt({ title, author, category, style, mood, subject, colorTheme }) {
  const parts = [
    `Professional book cover design for a ${category || 'fiction'} novel titled "${title}" by ${author}.`,
    'The cover should look like a real published book you would find on Amazon KDP or in a bookstore.',
    'Include the title text and author name on the cover.',
    'High resolution, print quality, 2:3 portrait aspect ratio.'
  ];

  if (style) parts.push(`Style: ${style}.`);
  if (mood) parts.push(`Mood: ${mood}.`);
  if (subject) parts.push(`Key imagery: ${subject}.`);
  if (colorTheme) parts.push(`Color palette: ${colorTheme}.`);

  return parts.join(' ');
}

/* ---------- Nyxen Worker image generation ---------- */

async function generateViaWorker(prompt, numImages) {
  // Call the Nyxen worker's generate-cover endpoint.
  // The worker has the OpenAI API key and can call DALL-E directly.
  const resp = await fetch(`${NYXEN_WORKER}/generate-cover`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt,
      n: Math.min(numImages, 4),
      size: '1024x1792'
    })
  });

  if (!resp.ok) {
    const errData = await resp.json().catch(() => ({}));
    throw new Error(errData.error || `Worker returned ${resp.status}`);
  }

  const data = await resp.json();

  // The worker may return images in different shapes depending on
  // whether it proxies DALL-E directly or wraps the response.
  if (data.images && Array.isArray(data.images)) {
    return data.images;
  }
  if (data.data && Array.isArray(data.data)) {
    return data.data.map((img) => img.url || img.b64_json);
  }

  throw new Error('Unexpected response shape from worker');
}

/* ---------- Placeholder fallback ---------- */

function generatePlaceholders(title, author, category, n) {
  const colors = [
    { bg: '1a1a2e', fg: 'C9A040' },
    { bg: '3d0c02', fg: 'e8c97a' },
    { bg: '0d1b2a', fg: 'e0b84a' },
    { bg: '2d1f2d', fg: 'C9A040' }
  ];

  const images = [];
  for (let i = 0; i < Math.min(n, 4); i++) {
    const c = colors[i % colors.length];
    const text = encodeURIComponent(`${title}\nby ${author}\n[${category}]`);
    images.push(
      `https://placehold.co/600x900/${c.bg}/${c.fg}?text=${text}&font=playfair-display`
    );
  }
  return images;
}
