const express = require('express');
const { sendError } = require('../helpers/errors.cjs');

const router = express.Router();

router.get('/search-images', async (req, res) => {
  const { q } = req.query;
  if (!q) return res.status(400).json({ error: 'Query required' });
  try {
    const apiKey = process.env.SERPAPI_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'SERPAPI_API_KEY not configured' });
    const params = new URLSearchParams({
      engine: 'google_images',
      api_key: apiKey,
      q: String(q),
      safe: 'active',
    });
    const response = await fetch(`https://serpapi.com/search?${params}`);
    const data = await response.json();
    const results = (data.image_results || []).map((item, i) => ({
      title: item.title || `Image ${i + 1}`,
      url: item.original || item.thumbnail,
      thumbnail: item.thumbnail,
      source: 'Google Images',
    }));
    res.json({ results });
  } catch (err) { sendError(res, err, 'GET /search-images'); }
});

module.exports = router;
