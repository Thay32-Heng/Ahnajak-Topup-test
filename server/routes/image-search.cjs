const express = require('express');
const { sendError } = require('../helpers/errors.cjs');

const router = express.Router();

let cachedToken = null;
let tokenExpiresAt = 0;

async function getAccessToken() {
  if (cachedToken && Date.now() < tokenExpiresAt) return cachedToken;
  const clientId = process.env.IGDB_CLIENT_ID;
  const clientSecret = process.env.IGDB_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error('IGDB_CLIENT_ID and IGDB_CLIENT_SECRET must be set in .env');
  const res = await fetch('https://id.twitch.tv/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'client_credentials',
    }),
  });
  const data = await res.json();
  if (!data.access_token) throw new Error('Failed to get IGDB access token');
  cachedToken = data.access_token;
  tokenExpiresAt = Date.now() + (data.expires_in || 3600) * 1000 - 60000;
  return cachedToken;
}

router.get('/search-images', async (req, res) => {
  const { q } = req.query;
  if (!q) return res.status(400).json({ error: 'Query required' });
  try {
    const accessToken = await getAccessToken();
    const clientId = process.env.IGDB_CLIENT_ID;

    const headers = {
      'Client-ID': clientId,
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'text/plain',
    };

    const [games, covers] = await Promise.all([
      fetch('https://api.igdb.com/v4/games', {
        method: 'POST',
        headers,
        body: `search "${String(q).replace(/"/g, '')}"; fields name,cover,category; limit 20;`,
      }).then(r => r.json()),
      fetch('https://api.igdb.com/v4/covers', {
        method: 'POST',
        headers,
        body: `fields url,game; limit 20;`,
      }).then(r => r.json()),
    ]);

    if (!Array.isArray(games)) return res.json({ results: [] });

    const coverMap = {};
    if (Array.isArray(covers)) {
      for (const c of covers) {
        coverMap[c.id] = c.url;
      }
    }

    const results = games
      .filter(g => g.cover && coverMap[g.cover])
      .map(g => {
        const igdbUrl = coverMap[g.cover];
        const imageId = igdbUrl?.match(/\/t_thumb\/(.+)\./)?.[1];
        const url = imageId ? `https://images.igdb.com/igdb/image/upload/t_cover_big/${imageId}.jpg` : null;
        const thumb = imageId ? `https://images.igdb.com/igdb/image/upload/t_thumb/${imageId}.jpg` : null;
        return { title: g.name, url, thumbnail: thumb, source: 'IGDB' };
      })
      .filter(r => r.url);

    res.json({ results });
  } catch (err) { sendError(res, err, 'GET /search-images'); }
});

module.exports = router;
