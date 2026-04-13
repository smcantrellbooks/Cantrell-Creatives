/**
 * POST /api/generate-cover
 *
 * Accepts book metadata and optional style preferences, builds a structured
 * prompt, and calls an image-generation service to return 3-4 cover options.
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
 *
 * Set the COVER_GEN_API_KEY environment variable to authenticate with the
 * upstream image provider.  The COVER_GEN_PROVIDER env var selects the
 * provider ("openai" | "stability" | "placeholder").  When no key is
 * configured the endpoint falls back to a deterministic placeholder service
 * so the UI can be developed and tested without credentials.
 */

module.exports = async (req, res) => {
  // CORS / method guard
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

    const provider = (process.env.COVER_GEN_PROVIDER || '').toLowerCase();
    const apiKey = process.env.COVER_GEN_API_KEY || '';

    let images;

    if (provider === 'openai' && apiKey) {
      images = await generateWithOpenAI(prompt, numImages, apiKey);
    } else if (provider === 'stability' && apiKey) {
      images = await generateWithStability(prompt, numImages, apiKey);
    } else {
      // Fallback: deterministic placeholder covers for development / demo
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
  let parts = [
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

/* ---------- OpenAI DALL-E provider ---------- */

async function generateWithOpenAI(prompt, n, apiKey) {
  const resp = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: 'dall-e-3',
      prompt,
      n: Math.min(n, 4),
      size: '1024x1792',
      quality: 'standard',
      response_format: 'url'
    })
  });

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(err.error?.message || 'OpenAI request failed');
  }

  const data = await resp.json();
  return (data.data || []).map((img) => img.url);
}

/* ---------- Stability AI provider ---------- */

async function generateWithStability(prompt, n, apiKey) {
  const urls = [];
  // Stability generates one image per request, so loop
  const count = Math.min(n, 4);
  for (let i = 0; i < count; i++) {
    const resp = await fetch(
      'https://api.stability.ai/v1/generation/stable-diffusion-xl-1024-v1-0/text-to-image',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
          Accept: 'application/json'
        },
        body: JSON.stringify({
          text_prompts: [{ text: prompt, weight: 1 }],
          cfg_scale: 7,
          width: 768,
          height: 1152,
          samples: 1,
          steps: 30
        })
      }
    );

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.message || 'Stability AI request failed');
    }

    const data = await resp.json();
    if (data.artifacts && data.artifacts[0]) {
      // Return as data URI since Stability returns base64
      urls.push(`data:image/png;base64,${data.artifacts[0].base64}`);
    }
  }
  return urls;
}

/* ---------- Placeholder fallback ---------- */

function generatePlaceholders(title, author, category, n) {
  // Use a placeholder image service to render realistic-looking cover mockups
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
    // Using placehold.co for deterministic placeholder covers
    images.push(
      `https://placehold.co/600x900/${c.bg}/${c.fg}?text=${text}&font=playfair-display`
    );
  }
  return images;
}
