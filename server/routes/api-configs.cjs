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

// ── All packages linked to G2Bulk (for Price Update tab) ──────────────────
router.get('/packages/linked-to-g2bulk', requireAuth, requireAdmin, async (req, res) => {
  try {
    const [rows] = await query(
      `SELECT p.id, p.game_id, g.name as game_name, p.name, p.price, p.g2bulk_product_id, p.price_markup_percent, 'packages' as tbl
       FROM packages p JOIN games g ON g.id = p.game_id WHERE p.g2bulk_product_id IS NOT NULL
       UNION ALL
       SELECT p.id, p.game_id, g.name as game_name, p.name, p.price, p.g2bulk_product_id, p.price_markup_percent, 'special_packages' as tbl
       FROM special_packages p JOIN games g ON g.id = p.game_id WHERE p.g2bulk_product_id IS NOT NULL
       UNION ALL
       SELECT p.id, p.game_id, g.name as game_name, p.name, p.price, p.g2bulk_product_id, p.price_markup_percent, 'preorder_packages' as tbl
       FROM preorder_packages p JOIN games g ON g.id = p.game_id WHERE p.g2bulk_product_id IS NOT NULL
       ORDER BY game_name, name`
    );
    res.json(rows);
  } catch (err) { sendError(res, err, 'GET /packages/linked-to-g2bulk'); }
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

// Toggle g2bulk product active status (show/hide on /get-vg page)
router.put('/g2bulk-products/:id/toggle-active', requireAuth, requireAdmin, async (req, res) => {
  try {
    await query('UPDATE g2bulk_products SET is_active = NOT is_active WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) { sendError(res, err, 'PUT /g2bulk-products/:id/toggle-active'); }
});

// Update g2bulk product price
router.put('/g2bulk-products/:id/price', requireAuth, requireAdmin, async (req, res) => {
  const { price } = req.body;
  if (typeof price !== 'number' || price < 0) return res.status(400).json({ error: 'Invalid price' });
  try {
    await query('UPDATE g2bulk_products SET price = ? WHERE id = ?', [price, req.params.id]);
    res.json({ success: true });
  } catch (err) { sendError(res, err, 'PUT /g2bulk-products/:id/price'); }
});

// Update g2bulk product icon (stored in fields.image_url — used on the shop page)
router.put('/g2bulk-products/:id/image', requireAuth, requireAdmin, async (req, res) => {
  const { image } = req.body;
  if (typeof image !== 'string') return res.status(400).json({ error: 'Invalid image' });
  try {
    const row = await queryOne('SELECT fields FROM g2bulk_products WHERE id = ?', [req.params.id]);
    if (!row) return res.status(404).json({ error: 'Product not found' });
    let fields = row.fields;
    if (typeof fields === 'string') { try { fields = JSON.parse(fields); } catch { fields = {}; } }
    if (!fields || typeof fields !== 'object') fields = {};
    await query('UPDATE g2bulk_products SET fields = ? WHERE id = ?',
      [JSON.stringify({ ...fields, image_url: image || null }), req.params.id]);
    res.json({ success: true });
  } catch (err) { sendError(res, err, 'PUT /g2bulk-products/:id/image'); }
});

// Per-product markup override for VG card products — stored in fields.markup_percent
// price = unit_price (G2Bulk cost) × (1 + markup%). Overrides the global markup for this product.
router.put('/g2bulk-products/:id/markup', requireAuth, requireAdmin, async (req, res) => {
  const markup = parseFloat(req.body?.markup);
  if (!Number.isFinite(markup) || markup < 0 || markup > 500) {
    return res.status(400).json({ error: 'markup must be between 0 and 500' });
  }
  try {
    const row = await queryOne('SELECT price, fields, product_type FROM g2bulk_products WHERE id = ?', [req.params.id]);
    if (!row) return res.status(404).json({ error: 'Product not found' });
    if (row.product_type !== 'card') return res.status(400).json({ error: 'Markup only applies to VG card products' });
    let fields = row.fields;
    if (typeof fields === 'string') { try { fields = JSON.parse(fields); } catch { fields = {}; } }
    if (!fields || typeof fields !== 'object') fields = {};
    let unitPrice = parseFloat(fields.unit_price);
    if (!Number.isFinite(unitPrice) || unitPrice <= 0) unitPrice = parseFloat(row.price);
    if (!Number.isFinite(unitPrice) || unitPrice <= 0) return res.status(400).json({ error: 'No base price for product' });
    const price = Math.round(unitPrice * (1 + markup / 100) * 100) / 100;
    await query('UPDATE g2bulk_products SET price = ?, fields = ? WHERE id = ?',
      [price, JSON.stringify({ ...fields, unit_price: unitPrice, markup_percent: markup }), req.params.id]);
    res.json({ success: true, price, unit_price: unitPrice, markup });
  } catch (err) { sendError(res, err, 'PUT /g2bulk-products/:id/markup'); }
});

// Update package markup — recalculates price from G2Bulk cost + markup %
router.put('/packages/:id/markup', requireAuth, requireAdmin, async (req, res) => {
  const { price_markup_percent } = req.body;
  try {
    const [pkg] = await query("SELECT p.id, p.g2bulk_product_id, 'packages' as tbl FROM packages p WHERE p.id = ? " +
      "UNION ALL SELECT sp.id, sp.g2bulk_product_id, 'special_packages' as tbl FROM special_packages sp WHERE sp.id = ? " +
      "UNION ALL SELECT pp.id, pp.g2bulk_product_id, 'preorder_packages' as tbl FROM preorder_packages pp WHERE pp.id = ?",
      [req.params.id, req.params.id, req.params.id]);
    if (!pkg.length) return res.status(404).json({ error: 'Package not found' });
    const { g2bulk_product_id, tbl } = pkg[0];

    // Look up G2Bulk cost price
    let g2bulkCost = null;
    if (g2bulk_product_id) {
      const gp = await queryOne('SELECT price FROM g2bulk_products WHERE g2bulk_product_id = ?', [g2bulk_product_id]);
      if (gp) g2bulkCost = parseFloat(gp.price);
    }

    const markup = price_markup_percent != null ? parseFloat(price_markup_percent) : null;
    let newPrice = null;

    if (g2bulkCost != null && markup != null && !isNaN(markup)) {
      newPrice = Math.round(g2bulkCost * (1 + markup / 100) * 100) / 100;
    }

    if (newPrice != null) {
      await query(`UPDATE \`${tbl}\` SET price = ?, price_markup_percent = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [newPrice, markup, req.params.id]);
    } else {
      await query(`UPDATE \`${tbl}\` SET price_markup_percent = ? WHERE id = ?`, [markup, req.params.id]);
    }

    res.json({ success: true, price: newPrice, markup });
  } catch (err) { sendError(res, err, 'PUT /packages/:id/markup'); }
});

// ── Database Import (used by DatabaseExportImport component) ──────────────
// Accepts the full export JSON object, replaces all data atomically
router.post('/import-database', requireAuth, requireAdmin, async (req, res) => {
  const { version, games, packages, specialPackages, siteSettings, gameVerificationConfigs, paymentQrSettings, paymentGateways } = req.body;
  if (!version || !games || !packages) {
    return res.status(400).json({ error: 'Invalid import data: version, games, and packages are required' });
  }
  try {
    // Delete in FK order (children first)
    await query('DELETE FROM packages');
    await query('DELETE FROM special_packages');
    await query('DELETE FROM preorder_packages');
    await query('DELETE FROM preorder_games');
    await query('DELETE FROM game_verification_configs');
    await query('DELETE FROM payment_qr_settings');
    await query('DELETE FROM site_settings');
    await query('DELETE FROM events');
    await query('DELETE FROM event_banners');
    await query('DELETE FROM payment_gateways');
    await query('DELETE FROM g2bulk_products');
    await query('DELETE FROM games');

    // Insert in FK order (parents first)
    const validGames = games.filter(g => g.id && g.name);
    if (games.length !== validGames.length) {
      console.warn(`Import: skipped ${games.length - validGames.length} game(s) with missing id or name`);
    }
    if (validGames.length > 0) {
      const placeholders = validGames.map(() => '(?, ?, ?, ?, ?, ?, ?, ?)').join(', ');
      const flat = validGames.flatMap(g => [g.id, g.name, g.image || null, g.slug || null, g.g2bulk_category_id || null, g.default_package_icon || null, g.cover_image || null, g.tags ? JSON.stringify(g.tags) : null]);
      await query(`INSERT INTO games (id, name, image, slug, g2bulk_category_id, default_package_icon, cover_image, tags) VALUES ${placeholders}`, flat);
    }

    const validPackages = packages.filter(p => p.id && p.game_id && p.name);
    if (packages.length !== validPackages.length) {
      console.warn(`Import: skipped ${packages.length - validPackages.length} package(s) with missing required fields`);
    }
    if (validPackages.length > 0) {
      const placeholders = validPackages.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').join(', ');
      const flat = validPackages.flatMap(p => [p.id, p.game_id, p.name, String(p.amount != null ? p.amount : 0), p.price != null ? p.price : 0, p.icon || null, p.sort_order ?? 0, p.label || null, p.label_bg_color || null, p.label_text_color || null, p.label_icon || null, p.g2bulk_product_id || null, p.g2bulk_type_id || null, p.quantity ?? null, p.points || 0]);
      await query(`INSERT INTO packages (id, game_id, name, amount, price, icon, sort_order, label, label_bg_color, label_text_color, label_icon, g2bulk_product_id, g2bulk_type_id, quantity, points) VALUES ${placeholders}`, flat);
    }

    const validSpecial = specialPackages.filter(p => p.id && p.game_id && p.name);
    if (specialPackages.length !== validSpecial.length) {
      console.warn(`Import: skipped ${specialPackages.length - validSpecial.length} special package(s) with missing required fields`);
    }
    if (validSpecial.length > 0) {
      const placeholders = validSpecial.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').join(', ');
      const flat = validSpecial.flatMap(p => [p.id, p.game_id, p.name, String(p.amount != null ? p.amount : 0), p.price != null ? p.price : 0, p.icon || null, p.sort_order ?? 0, p.label || null, p.label_bg_color || null, p.label_text_color || null, p.label_icon || null, p.g2bulk_product_id || null, p.g2bulk_type_id || null, p.quantity ?? null, p.points || 0]);
      await query(`INSERT INTO special_packages (id, game_id, name, amount, price, icon, sort_order, label, label_bg_color, label_text_color, label_icon, g2bulk_product_id, g2bulk_type_id, quantity, points) VALUES ${placeholders}`, flat);
    }

    if (siteSettings.length > 0) {
      for (const s of siteSettings) {
        await query(
          'INSERT INTO site_settings (id, `key`, value) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE value = VALUES(value)',
          [s.id || uuid(), s.key, typeof s.value === 'string' ? s.value : JSON.stringify(s.value)]
        );
      }
    }

    if (gameVerificationConfigs?.length > 0) {
      const validConfigs = gameVerificationConfigs.filter(c => c.id && c.game_name && c.api_code);
      if (gameVerificationConfigs.length !== validConfigs.length) {
        console.warn(`Import: skipped ${gameVerificationConfigs.length - validConfigs.length} game verification config(s) with missing required fields`);
      }
      for (const c of validConfigs) {
        const id = c.id || uuid();
        await query(
          'INSERT INTO game_verification_configs (id, game_name, api_code, api_provider, requires_zone, default_zone, is_active, zone_options) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE game_name = VALUES(game_name), api_code = VALUES(api_code), api_provider = VALUES(api_provider), requires_zone = VALUES(requires_zone), default_zone = VALUES(default_zone), is_active = VALUES(is_active), zone_options = VALUES(zone_options)',
          [id, c.game_name, c.api_code, c.api_provider || 'g2bulk', c.requires_zone ? 1 : 0, c.default_zone || null, c.is_active ?? 1, c.zone_options ? JSON.stringify(c.zone_options) : null]
        );
      }
    }

    if (paymentQrSettings?.length > 0) {
      for (const q of paymentQrSettings) {
        const id = q.id || uuid();
        await query(
          'INSERT INTO payment_qr_settings (id, payment_method, qr_code_image, bank_name, account_name, account_number, instructions, is_enabled) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE payment_method = VALUES(payment_method), qr_code_image = VALUES(qr_code_image), bank_name = VALUES(bank_name), account_name = VALUES(account_name), account_number = VALUES(account_number), instructions = VALUES(instructions), is_enabled = VALUES(is_enabled)',
          [id, q.payment_method, q.qr_code_image, q.bank_name, q.account_name, q.account_number, q.instructions, q.is_enabled != null ? (q.is_enabled ? 1 : 0) : 1]
        );
      }
    }

    if (paymentGateways?.length > 0) {
      for (const g of paymentGateways) {
        const id = g.id || uuid();
        await query(
          'INSERT INTO payment_gateways (id, slug, name, enabled, config) VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE name = VALUES(name), enabled = VALUES(enabled), config = VALUES(config)',
          [id, g.slug, g.name, g.enabled != null ? (g.enabled ? 1 : 0) : 1, g.config ? JSON.stringify(g.config) : null]
        );
      }
    }

    res.json({
      success: true,
      imported: {
        games: validGames.length,
        packages: validPackages.length,
        specialPackages: validSpecial.length,
        siteSettings: siteSettings.length,
        gameVerificationConfigs: (gameVerificationConfigs?.length || 0),
        paymentGateways: paymentGateways?.length || 0,
      },
    });
  } catch (err) {
    sendError(res, err, 'POST /admin/import-database');
  }
});

module.exports = router;
