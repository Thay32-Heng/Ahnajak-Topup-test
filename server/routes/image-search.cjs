const express = require('express');
const { sendError } = require('../helpers/errors.cjs');

const router = express.Router();

// ── Google Custom Search JSON API ─────────────────────────────────────
async function searchGoogleImages(q) {
  const apiKey = process.env.GOOGLE_API_KEY;
  const cx = process.env.GOOGLE_CX;
  if (!apiKey || !cx) return null;
  const params = new URLSearchParams({
    key: apiKey,
    cx,
    q: String(q),
    searchType: 'image',
    safe: 'active',
    num: '15',
  });
  const res = await fetch(`https://www.googleapis.com/customsearch/v1?${params}`);
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    const msg = errBody?.error?.message || `Google API returned ${res.status}`;
    console.error(`[Google Search] ${msg} (q: ${q})`);
    throw new Error(msg);
  }
  const data = await res.json();
  if (!data.items?.length) return null;
  return data.items.map((item, i) => ({
    title: item.title || `Image ${i + 1}`,
    url: item.link,
    thumbnail: item.image?.thumbnailLink || item.link,
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
    // Try Google Custom Search JSON API first (if API key + cx configured)
    const googleResults = await searchGoogleImages(q);
    if (googleResults) return res.json({ results: googleResults });

    // Fall back to App Store + Google Play
    const [appStore, googlePlay] = await Promise.all([
      searchAppStore(q).catch(() => []),
      searchGooglePlay(q).catch(() => []),
    ]);
    res.json({ results: [...appStore, ...googlePlay] });
  } catch (err) { sendError(res, err, 'GET /search-images'); }
});

module.exports = router;
