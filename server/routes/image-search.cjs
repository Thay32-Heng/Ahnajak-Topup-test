const express = require('express');
const { sendError } = require('../helpers/errors.cjs');

const router = express.Router();

// ── Google search via SerpApi ─────────────────────────────────────────
async function searchSerpApi(q) {
  const apiKey = process.env.SERPAPI_API_KEY;
  if (!apiKey) return null;
  const params = new URLSearchParams({
    engine: 'google_images',
    api_key: apiKey,
    q: String(q),
    safe: 'active',
  });
  const res = await fetch(`https://serpapi.com/search?${params}`);
  const data = await res.json();
  if (!data.image_results?.length) return null;
  return data.image_results.map((item, i) => ({
    title: item.title || `Image ${i + 1}`,
    url: item.original || item.thumbnail,
    thumbnail: item.thumbnail,
    source: 'Google Images',
  }));
}

// ── App Store search (iTunes API) ─────────────────────────────────────
async function searchAppStore(q) {
  const res = await fetch(
    `https://itunes.apple.com/search?term=${encodeURIComponent(String(q))}&entity=software&limit=15`,
    { headers: { Accept: 'application/json' } }
  );
  const data = await res.json();
  if (!data.results?.length) return [];
  return data.results.map((app, i) => ({
    title: app.trackName || `App ${i + 1}`,
    url: app.artworkUrl512 || app.artworkUrl100,
    thumbnail: app.artworkUrl100,
    source: 'App Store',
  }));
}

// ── Google Play Store search (scrape) ─────────────────────────────────
async function searchGooglePlay(q) {
  const res = await fetch(
    `https://play.google.com/store/search?q=${encodeURIComponent(String(q))}&c=apps`,
    { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36' } }
  );
  const html = await res.text();
  const results = [];
  const iconRegex = /<img[^>]*src="(https:\/\/play-lh\.googleusercontent\.com\/[^"]+)"[^>]*>/g;
  const titleRegex = /<span[^>]*class="[^"]*title[^"]*"[^>]*>([^<]+)<\/span>/gi;
  const icons = [...html.matchAll(iconRegex)];
  const titles = [...html.matchAll(titleRegex)];
  for (let i = 0; i < Math.min(icons.length, 15); i++) {
    const iconUrl = icons[i][1];
    const title = titles[i]?.[1]?.trim() || `Result ${i + 1}`;
    if (iconUrl) {
      results.push({
        title,
        url: iconUrl.replace(/=w[0-9]+-h[0-9]+(-rw)?/, '=w512-h512'),
        thumbnail: iconUrl,
        source: 'Google Play',
      });
    }
  }
  return results;
}

router.get('/search-images', async (req, res) => {
  const { q } = req.query;
  if (!q) return res.status(400).json({ error: 'Query required' });
  try {
    // Try SerpApi Google Images first (if API key configured)
    const serpResults = await searchSerpApi(q);
    if (serpResults) return res.json({ results: serpResults });

    // Fall back to App Store + Google Play
    const [appStore, googlePlay] = await Promise.all([
      searchAppStore(q).catch(() => []),
      searchGooglePlay(q).catch(() => []),
    ]);
    res.json({ results: [...appStore, ...googlePlay] });
  } catch (err) { sendError(res, err, 'GET /search-images'); }
});

module.exports = router;
