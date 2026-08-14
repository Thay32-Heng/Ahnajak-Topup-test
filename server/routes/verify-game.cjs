/**
 * routes/verify-game.cjs — Game ID verification via G2Bulk API
 * Ports the Supabase edge function `verify-game-id` (~400 lines) to Express + MySQL.
 * POST /api/verify-game-id  body: { gameName, userId, serverId? }
 */
const express = require('express');
const { query, queryOne } = require('../db.cjs');

const router = express.Router();
const G2BULK_API_URL = 'https://api.kesor.com/v1';

// Config cache (refreshed every 5 minutes)
let configCache = [];
let cacheTimestamp = 0;
const CACHE_TTL = 5 * 60 * 1000;

async function getGameConfigs() {
  const now = Date.now();
  if (configCache.length > 0 && (now - cacheTimestamp) < CACHE_TTL) return configCache;
  const [rows] = await query('SELECT game_name, api_code, api_provider, requires_zone, default_zone FROM game_verification_configs WHERE is_active = 1');
  configCache = rows || [];
  cacheTimestamp = now;
  return configCache;
}

function normalizeGameName(gameName) {
  const n = gameName.toLowerCase().trim();
  if (n === 'mlbb' || n.includes('mobile legends bang bang')) return 'Mobile Legends';
  if (n === 'ml') return 'Mobile Legends';
  if (n === 'ff' || n === 'freefire') return 'Free Fire';
  if (n === 'hok') return 'Honor of Kings';
  if (n === 'pubgm') return 'PUBG Mobile';
  if (n === 'codm') return 'Call of Duty Mobile';
  if (n === 'aov') return 'Arena of Valor';
  if (n === 'zzz') return 'Zenless Zone Zero';
  if (n === 'hsr') return 'Honkai Star Rail';
  return gameName;
}

async function findGameConfig(gameName) {
  const configs = await getGameConfigs();
  const find = (fn) => configs.find(fn);
  // Exact match
  let cfg = find(c => c.game_name === gameName);
  if (cfg) return cfg;
  // Lowercase
  cfg = find(c => c.game_name.toLowerCase() === gameName.toLowerCase());
  if (cfg) return cfg;
  // Normalized
  const normalized = normalizeGameName(gameName);
  cfg = find(c => c.game_name === normalized || c.game_name.toLowerCase() === normalized.toLowerCase());
  if (cfg) return cfg;
  // Partial match
  cfg = find(c => c.game_name.toLowerCase().includes(gameName.toLowerCase()) || gameName.toLowerCase().includes(c.game_name.toLowerCase()));
  return cfg || null;
}

function findAlternateRegions(gameCode, gameName) {
  const basePatterns = [/^(mlbb)(_.*)?$/i, /^(freefire)(_.*)?$/i, /^(valorant)(_.*)?$/i, /^(pubg)(_.*)?$/i, /^(cod)(_.*)?$/i, /^(lol|league)(_.*)?$/i, /^(genshin)(_.*)?$/i, /^(hsr)(_.*)?$/i, /^(zzz)(_.*)?$/i, /^(hok)(_.*)?$/i];
  let baseCode = gameCode.toLowerCase();
  for (const p of basePatterns) {
    const m = gameCode.match(p);
    if (m) { baseCode = m[1].toLowerCase(); break; }
  }
  const gameNameLower = gameName.toLowerCase();
  const keywords = ['mobile legends', 'free fire', 'valorant', 'pubg', 'call of duty', 'league of legends', 'genshin', 'honkai', 'honor of kings'];
  let matchedKeyword = '';
  for (const kw of keywords) { if (gameNameLower.includes(kw)) { matchedKeyword = kw; break; } }

  return configCache
    .filter(c => c.api_code !== gameCode && (c.api_code.toLowerCase().startsWith(baseCode) || (matchedKeyword && c.game_name.toLowerCase().includes(matchedKeyword))))
    .slice(0, 5);
}

router.post('/', async (req, res) => {
  const { gameName, userId, serverId } = req.body;
  if (!gameName || !userId) {
    return res.status(400).json({ success: false, error: 'Missing gameName or userId' });
  }

  try {
    // Get G2Bulk API config
    const apiConfig = await queryOne("SELECT * FROM api_configurations WHERE api_name = 'g2bulk'");
    if (!apiConfig || !apiConfig.is_enabled) {
      return res.status(503).json({ success: false, error: 'Verification service is currently disabled.' });
    }
    if (!apiConfig.api_secret) {
      return res.status(503).json({ success: false, error: 'Verification service not properly configured.' });
    }
    const apiKey = apiConfig.api_secret;

    // Find game config
    const gameConfig = await findGameConfig(gameName);
    let gameCode, requiresZone;
    if (gameConfig) {
      gameCode = gameConfig.api_code;
      requiresZone = !!gameConfig.requires_zone;
    } else {
      gameCode = gameName.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
      requiresZone = false;
    }

    if (requiresZone && !serverId && !gameConfig?.default_zone) {
      return res.status(400).json({ success: false, error: `${gameName} requires a Server/Zone ID. Please enter your Server ID.`, requiresServerId: true });
    }

    const requestBody = { game: gameCode, user_id: String(userId) };
    const zoneValue = serverId || (gameConfig?.default_zone);
    if (zoneValue) requestBody.server_id = String(zoneValue);

    const response = await fetch(`${G2BULK_API_URL}/games/checkPlayerId`, {
      method: 'POST',
      headers: { 'Accept': 'application/json', 'Content-Type': 'application/json', 'X-API-Key': apiKey },
      body: JSON.stringify(requestBody),
    });

    const contentType = response.headers.get('content-type') || '';
    const responseText = await response.text();

    if (!contentType.includes('application/json')) {
      return res.status(503).json({ success: false, error: 'Game verification service unavailable. Please try again later.' });
    }

    let data;
    try { data = JSON.parse(responseText); }
    catch { return res.status(503).json({ success: false, error: 'Invalid response from verification service.' }); }

    if (data.valid === 'valid' && data.name) {
      return res.json({
        success: true, username: data.name, userId, serverId: serverId || undefined,
        accountName: data.name, openId: data.openid, verifiedBy: 'G2Bulk',
      });
    }

    if (data.valid === 'invalid' || data.error) {
      const errorMsg = data.message || data.error || 'Player ID not found or invalid';
      const alternates = findAlternateRegions(gameCode, gameName);
      let errorMessage = errorMsg;
      if (alternates.length > 0) {
        errorMessage = `${errorMsg}. This game has regional versions - try: ${alternates.map(a => a.game_name).join(', ')}`;
      }
      return res.status(404).json({
        success: false, error: errorMessage,
        alternateRegions: alternates.length > 0 ? alternates.map(a => ({ gameName: a.game_name, apiCode: a.api_code, requiresZone: !!a.requires_zone })) : undefined,
      });
    }

    return res.status(400).json({ success: false, error: data.message || 'Unable to verify player ID. Please check your ID and try again.' });
  } catch (err) {
    console.error('[VerifyGameID] Error:', err.message);
    return res.status(500).json({ success: false, error: 'Verification service error. Please try again later.' });
  }
});

module.exports = router;
