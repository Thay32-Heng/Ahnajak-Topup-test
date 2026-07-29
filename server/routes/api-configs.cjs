/**
 * routes/api-configs.cjs — api_configurations + game_verification_configs CRUD (admin)
 */
const express = require('express');
const { query, queryOne, uuid } = require('../db.cjs');
const { requireAuth, requireAdmin, optionalAuth } = require('../auth.cjs');
const { sendError } = require('../helpers/errors.cjs');

const router = express.Router();

// ── API configurations ──────────────────────────────────────────────────────
router.get('/api-configs', requireAuth, requireAdmin, async (req, res) => {
  try {
    const [rows] = await query('SELECT * FROM api_configurations ORDER BY api_name');
    res.json(rows);
  } catch (err) { sendError(res, err, 'GET /api-configs'); }
});

router.put('/api-configs/:apiName', requireAuth, requireAdmin, async (req, res) => {
  const { apiName } = req.params;
  const { api_uid, api_secret, is_enabled, use_sandbox } = req.body;
  try {
    const existing = await queryOne('SELECT id FROM api_configurations WHERE api_name = ?', [apiName]);
    if (existing) {
      const sets = [], values = [];
      if (api_uid !== undefined) { sets.push('api_uid = ?'); values.push(api_uid); }
      if (api_secret !== undefined) { sets.push('api_secret = ?'); values.push(api_secret); }
      if (is_enabled !== undefined) { sets.push('is_enabled = ?'); values.push(is_enabled ? 1 : 0); }
      if (use_sandbox !== undefined) { sets.push('use_sandbox = ?'); values.push(use_sandbox ? 1 : 0); }
      if (sets.length) { values.push(apiName); await query(`UPDATE api_configurations SET ${sets.join(', ')} WHERE api_name = ?`, values); }
    } else {
      await query(
        'INSERT INTO api_configurations (id, api_name, api_uid, api_secret, is_enabled, use_sandbox) VALUES (?, ?, ?, ?, ?, ?)',
        [uuid(), apiName, api_uid || null, api_secret || null, is_enabled ? 1 : 0, use_sandbox ? 1 : 0]
      );
    }
    res.json({ success: true });
  } catch (err) { sendError(res, err, 'PUT /api-configs/:apiName'); }
});

// ── Game verification configs ──────────────────────────────────────────────
router.get('/game-verification', optionalAuth, async (req, res) => {
  try {
    const [rows] = await query('SELECT * FROM game_verification_configs ORDER BY game_name');
    res.json(rows);
  } catch (err) { sendError(res, err, 'GET /game-verification'); }
});

router.post('/game-verification', requireAuth, requireAdmin, async (req, res) => {
  const items = Array.isArray(req.body) ? req.body : [req.body];
  const inserted = [];
  try {
    for (const b of items) {
      if (!b.game_name) continue;
      const id = uuid();
      await query(
        `INSERT INTO game_verification_configs (id, game_name, api_code, api_provider, requires_zone, default_zone, is_active, zone_options)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, b.game_name, b.api_code, b.api_provider || 'g2bulk', b.requires_zone ? 1 : 0, b.default_zone || null, b.is_active ?? 1, b.zone_options ? JSON.stringify(b.zone_options) : null]
      );
      inserted.push(await queryOne('SELECT * FROM game_verification_configs WHERE id = ?', [id]));
    }
    res.json(inserted);
  } catch (err) { sendError(res, err, 'POST /game-verification'); }
});

router.put('/game-verification/:id', requireAuth, requireAdmin, async (req, res) => {
  const { id } = req.params;
  const sets = [], values = [];
  for (const [k, col] of Object.entries({
    game_name: 'game_name', api_code: 'api_code', api_provider: 'api_provider',
    requires_zone: 'requires_zone', default_zone: 'default_zone', is_active: 'is_active',
    zone_options: 'zone_options',
  })) {
    if (req.body[k] !== undefined) {
      sets.push(`${col} = ?`);
      values.push(k === 'zone_options' ? JSON.stringify(req.body[k]) : k === 'requires_zone' || k === 'is_active' ? (req.body[k] ? 1 : 0) : req.body[k]);
    }
  }
  if (!sets.length) return res.json({ success: true });
  values.push(id);
  try { await query(`UPDATE game_verification_configs SET ${sets.join(', ')} WHERE id = ?`, values); res.json({ success: true }); }
  catch (err) { sendError(res, err, 'PUT /game-verification/:id'); }
});

router.delete('/game-verification/:id', requireAuth, requireAdmin, async (req, res) => {
  try { await query('DELETE FROM game_verification_configs WHERE id = ?', [req.params.id]); res.json({ success: true }); }
  catch (err) { sendError(res, err, 'DELETE /game-verification/:id'); }
});

router.delete('/game-verification', requireAuth, requireAdmin, async (req, res) => {
  try { await query('DELETE FROM game_verification_configs'); res.json({ success: true }); }
  catch (err) { sendError(res, err, 'DELETE /game-verification'); }
});

// ── G2Bulk products ─────────────────────────────────────────────────────────
router.get('/g2bulk-products', requireAuth, requireAdmin, async (req, res) => {
  try {
    const [rows] = await query('SELECT * FROM g2bulk_products ORDER BY game_name, product_name');
    res.json(rows);
  } catch (err) { sendError(res, err, 'GET /g2bulk-products'); }
});

router.delete('/g2bulk-products/:id', requireAuth, requireAdmin, async (req, res) => {
  try { await query('DELETE FROM g2bulk_products WHERE id = ?', [req.params.id]); res.json({ success: true }); }
  catch (err) { sendError(res, err, 'DELETE /g2bulk-products/:id'); }
});

// Update package markup
router.put('/packages/:id/markup', requireAuth, requireAdmin, async (req, res) => {
  const { price_markup_percent } = req.body;
  try {
    const [pkg] = await query("SELECT id, 'packages' as tbl FROM packages WHERE id = ? " +
      "UNION ALL SELECT id, 'special_packages' as tbl FROM special_packages WHERE id = ? " +
      "UNION ALL SELECT id, 'preorder_packages' as tbl FROM preorder_packages WHERE id = ?",
      [req.params.id, req.params.id, req.params.id]);
    if (!pkg.length) return res.status(404).json({ error: 'Package not found' });
    const tbl = pkg[0].tbl;
    await query(`UPDATE \`${tbl}\` SET price_markup_percent = ? WHERE id = ?`, [price_markup_percent, req.params.id]);
    res.json({ success: true });
  } catch (err) { sendError(res, err, 'PUT /packages/:id/markup'); }
});

module.exports = router;
