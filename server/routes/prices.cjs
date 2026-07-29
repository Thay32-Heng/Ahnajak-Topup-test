/**
 * routes/prices.cjs — Price update from G2Bulk catalogue
 * POST /api/update-prices
 * Body: { selectedGameIds?: string[] } — empty or omitted = all games
 */
const express = require('express');
const { query, queryOne } = require('../db.cjs');
const { requireAdmin } = require('../auth.cjs');
const { sendError } = require('../helpers/errors.cjs');

const router = express.Router();
const G2BULK_API_URL = 'https://api.g2bulk.com/v1';

async function applyMarkup(price, markupPct) {
  if (markupPct == null) return price;
  return Math.round(price * (1 + markupPct / 100) * 100) / 100;
}

async function updateGamePrices(apiKey, gameCode, selectedG2Ids, globalMarkup) {
  const headers = { Accept: 'application/json', 'X-API-Key': apiKey };
  const catRes = await fetch(`${G2BULK_API_URL}/games/${gameCode}/catalogue`, { headers });
  const catData = await catRes.json();
  if (!catData.success || !catData.catalogues) return [];

  const results = [];

  for (const cat of catData.catalogues) {
    const g2Id = `game_${gameCode}_${cat.id}`;
    if (selectedG2Ids && !selectedG2Ids.includes(g2Id)) continue;

    const g2Price = parseFloat(cat.amount) || 0;

    // Find local packages matching this g2bulk_product_id and get their markup
    const [packages] = await query(
      "SELECT id, price, price_markup_percent, 'packages' as tbl FROM packages WHERE g2bulk_product_id = ? " +
      "UNION ALL " +
      "SELECT id, price, price_markup_percent, 'special_packages' as tbl FROM special_packages WHERE g2bulk_product_id = ? " +
      "UNION ALL " +
      "SELECT id, price, price_markup_percent, 'preorder_packages' as tbl FROM preorder_packages WHERE g2bulk_product_id = ?",
      [g2Id, g2Id, g2Id]
    );

    for (const pkg of packages) {
      // Global markup overrides per-package markup for this update
      const effectiveMarkup = globalMarkup != null ? globalMarkup : pkg.price_markup_percent;
      const newPrice = await applyMarkup(g2Price, effectiveMarkup);
      const oldPrice = parseFloat(pkg.price) || 0;
      if (newPrice !== oldPrice) {
        await query(`UPDATE \`${pkg.tbl}\` SET price = ? WHERE id = ?`, [newPrice, pkg.id]);
      }
      results.push({
        package_id: pkg.id,
        name: cat.name || cat.id,
        old_price: oldPrice,
        new_price: newPrice,
        cost: g2Price,
        markup: effectiveMarkup || 0,
        table: pkg.tbl,
      });
    }
  }

  return results;
}

router.post('/', requireAdmin, async (req, res) => {
  try {
    const apiConfig = await queryOne("SELECT * FROM api_configurations WHERE api_name = 'g2bulk'");
    if (!apiConfig?.is_enabled || !apiConfig?.api_secret) {
      return res.status(400).json({ success: false, error: 'G2Bulk API not configured' });
    }
    const apiKey = apiConfig.api_secret;

    const { selectedGameIds, globalMarkup } = req.body || {};
    const effectiveGlobalMarkup = (globalMarkup != null && !isNaN(parseFloat(globalMarkup))) ? parseFloat(globalMarkup) : null;
    let gameCodes = [];

    if (selectedGameIds && selectedGameIds.length > 0) {
      // Fetch only selected games
      for (const gameId of selectedGameIds) {
        const game = await queryOne('SELECT g2bulk_category_id FROM games WHERE id = ?', [gameId]);
        if (game?.g2bulk_category_id) gameCodes.push(game.g2bulk_category_id);
      }
    } else {
      // Fetch all games from G2Bulk
      const gamesRes = await fetch(`${G2BULK_API_URL}/games`, {
        headers: { Accept: 'application/json', 'X-API-Key': apiKey },
      });
      const gamesData = await gamesRes.json();
      if (gamesData.success && gamesData.games) {
        gameCodes = gamesData.games.map(g => g.code);
      }
    }

    if (gameCodes.length === 0) {
      return res.json({ success: true, updated: 0, errors: 0, details: [], g2bulk_prices_synced: 0 });
    }

    let allDetails = [];
    let errors = 0;

    for (const code of gameCodes) {
      try {
        const results = await updateGamePrices(apiKey, code, undefined, effectiveGlobalMarkup);
        allDetails.push(...results);
      } catch (err) {
        errors++;
        console.error(`[UpdatePrices] Error for ${code}:`, err.message);
      }
    }

    res.json({
      success: true,
      g2bulk_prices_synced: allDetails.length,
      packages_updated: allDetails.filter(d => d.new_price !== d.old_price).length,
      details: allDetails.filter(d => d.new_price !== d.old_price),
      errors,
    });
  } catch (err) { sendError(res, err, 'POST /update-prices'); }
});

module.exports = router;
