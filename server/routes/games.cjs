/**
 * routes/games.cjs — games, packages, special_packages CRUD + sort moves
 * Public:  GET (list games, packages, special_packages)
 * Admin:   POST/PUT/DELETE for all three, plus sort-order swaps
 */
const express = require('express');
const { query, queryOne, uuid } = require('../db.cjs');
const { requireAdmin } = require('../auth.cjs');
const { sendError } = require('../helpers/errors.cjs');

const router = express.Router();

// ── GAMES ──────────────────────────────────────────────────────────────────

// Bulk delete all packages (admin — used by DatabaseExportImport)
router.delete('/packages/all', requireAdmin, async (req, res) => {
  try {
    await query('DELETE FROM packages');
    res.json({ success: true });
  } catch (err) { sendError(res, err, 'DELETE /packages/all'); }
});

// Bulk delete all special packages (admin — used by DatabaseExportImport)
router.delete('/special-packages/all', requireAdmin, async (req, res) => {
  try {
    await query('DELETE FROM special_packages');
    res.json({ success: true });
  } catch (err) { sendError(res, err, 'DELETE /special-packages/all'); }
});

// Bulk delete all games (admin — used by DatabaseExportImport)
router.delete('/', requireAdmin, async (req, res) => {
  try {
    await query('DELETE FROM games');
    res.json({ success: true });
  } catch (err) { sendError(res, err, 'DELETE /games'); }
});

// List all packages (public — used by SiteContext bulk load)
router.get('/packages/all', async (req, res) => {
  try {
    const [rows] = await query('SELECT * FROM packages ORDER BY sort_order ASC');
    res.json(rows);
  } catch (err) { sendError(res, err, 'GET /packages/all'); }
});

// List all special packages (public — used by SiteContext bulk load)
router.get('/special-packages/all', async (req, res) => {
  try {
    const [rows] = await query('SELECT * FROM special_packages ORDER BY sort_order ASC');
    res.json(rows);
  } catch (err) { sendError(res, err, 'GET /special-packages/all'); }
});

// List all games (public)
router.get('/', async (req, res) => {
  try {
    const [games] = await query('SELECT * FROM games ORDER BY sort_order ASC');
    res.json(games);
  } catch (err) { sendError(res, err, 'GET /games'); }
});

// Create game (admin)
router.post('/', requireAdmin, async (req, res) => {
  const { name, image, slug, g2bulk_category_id, default_package_icon, cover_image, tags } = req.body;
  const id = uuid();
  try {
    await query(
      `INSERT INTO games (id, name, image, slug, g2bulk_category_id, default_package_icon, cover_image, tags)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, name, image || null, slug || null, g2bulk_category_id || null, default_package_icon || null, cover_image || null, tags ? JSON.stringify(tags) : null]
    );
    const game = await queryOne('SELECT * FROM games WHERE id = ?', [id]);
    res.json(game);
  } catch (err) { sendError(res, err, 'POST /games'); }
});

// Update game (admin)
router.put('/:id', requireAdmin, async (req, res) => {
  const { id } = req.params;
  const fields = ['name', 'image', 'slug', 'g2bulk_category_id', 'default_package_icon', 'cover_image', 'tags', 'sort_order', 'description'];
  const sets = [];
  const values = [];
  for (const f of fields) {
    if (req.body[f] !== undefined) {
      sets.push(`${f === 'g2bulk_category_id' ? 'g2bulk_category_id' : f} = ?`);
      values.push(f === 'tags' ? JSON.stringify(req.body[f]) : req.body[f]);
    }
  }
  if (sets.length === 0) return res.json({ success: true });
  values.push(id);
  try {
    await query(`UPDATE games SET ${sets.join(', ')} WHERE id = ?`, values);
    res.json({ success: true });
  } catch (err) { sendError(res, err, 'PUT /games/:id'); }
});

// Delete game (admin)
router.delete('/:id', requireAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    await query('DELETE FROM games WHERE id = ?', [id]);
    res.json({ success: true });
  } catch (err) { sendError(res, err, 'DELETE /games/:id'); }
});

// Reorder games (batch) (admin)
router.put('/reorder', requireAdmin, async (req, res) => {
  const { order } = req.body;
  if (!Array.isArray(order) || !order.length) return res.status(400).json({ error: 'order array required' });
  try {
    for (let i = 0; i < order.length; i++) {
      await query('UPDATE games SET sort_order = ? WHERE id = ?', [i, order[i]]);
    }
    res.json({ success: true });
  } catch (err) { sendError(res, err, 'PUT /games/reorder'); }
});

// Move game (swap sort_order) (admin)
router.post('/:id/move', requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { direction } = req.body; // 'up' | 'down'
  try {
    const games = (await query('SELECT id, sort_order FROM games ORDER BY sort_order ASC'))[0];
    const idx = games.findIndex(g => g.id === id);
    if (idx === -1) return res.status(404).json({ error: 'Game not found' });
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= games.length) return res.json({ success: true });
    const current = games[idx], target = games[targetIdx];
    await query('UPDATE games SET sort_order = ? WHERE id = ?', [target.sort_order, current.id]);
    await query('UPDATE games SET sort_order = ? WHERE id = ?', [current.sort_order, target.id]);
    res.json({ success: true });
  } catch (err) { sendError(res, err, 'POST /games/:id/move'); }
});

// ── PACKAGES ───────────────────────────────────────────────────────────────

// List packages for a game (public)
router.get('/:gameId/packages', async (req, res) => {
  try {
    const [rows] = await query('SELECT * FROM packages WHERE game_id = ? ORDER BY sort_order ASC', [req.params.gameId]);
    res.json(rows);
  } catch (err) { sendError(res, err, 'GET /:gameId/packages'); }
});

// Create package (admin)
router.post('/:gameId/packages', requireAdmin, async (req, res) => {
  const { gameId } = req.params;
  const b = req.body;
  const id = uuid();
  try {
    await query(
      `INSERT INTO packages (id, game_id, name, amount, price, icon, sort_order, label, label_bg_color, label_text_color, label_icon, g2bulk_product_id, g2bulk_type_id, quantity, points)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, gameId, b.name, String(b.amount), b.price, b.icon || null, 0, b.label || null, b.labelBgColor || null, b.labelTextColor || null, b.labelIcon || null, b.g2bulkProductId || null, b.g2bulkTypeId || null, b.quantity ?? null, b.points || 0]
    );
    const pkg = await queryOne('SELECT * FROM packages WHERE id = ?', [id]);
    res.json(pkg);
  } catch (err) { sendError(res, err, 'POST /:gameId/packages'); }
});

// Update package (admin)
router.put('/:gameId/packages/:pkgId', requireAdmin, async (req, res) => {
  const { pkgId } = req.params;
  const b = req.body;
  const fieldMap = {
    name: 'name', amount: 'amount', price: 'price', icon: 'icon', sort_order: 'sort_order',
    label: 'label', labelBgColor: 'label_bg_color', labelTextColor: 'label_text_color',
    labelIcon: 'label_icon', g2bulkProductId: 'g2bulk_product_id', g2bulkTypeId: 'g2bulk_type_id',
    quantity: 'quantity', points: 'points',
  };
  const sets = [], values = [];
  for (const [k, col] of Object.entries(fieldMap)) {
    if (b[k] !== undefined) {
      sets.push(`${col} = ?`);
      values.push(k === 'amount' ? String(b[k]) : (b[k] === '' ? null : b[k]));
    }
  }
  if (sets.length === 0) return res.json({ success: true });
  values.push(pkgId);
  try {
    await query(`UPDATE packages SET ${sets.join(', ')} WHERE id = ?`, values);
    res.json({ success: true });
  } catch (err) { sendError(res, err, 'PUT /:gameId/packages/:pkgId'); }
});

// Delete package (admin)
router.delete('/:gameId/packages/:pkgId', requireAdmin, async (req, res) => {
  try {
    await query('DELETE FROM packages WHERE id = ?', [req.params.pkgId]);
    res.json({ success: true });
  } catch (err) { sendError(res, err, 'DELETE /:gameId/packages/:pkgId'); }
});

// Move package (admin)
router.post('/:gameId/packages/:pkgId/move', requireAdmin, async (req, res) => {
  const { gameId, pkgId } = req.params;
  const { direction } = req.body;
  try {
    const pkgs = (await query('SELECT id, sort_order FROM packages WHERE game_id = ? ORDER BY sort_order ASC', [gameId]))[0];
    const idx = pkgs.findIndex(p => p.id === pkgId);
    if (idx === -1) return res.status(404).json({ error: 'Package not found' });
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= pkgs.length) return res.json({ success: true });
    const current = pkgs[idx], target = pkgs[targetIdx];
    await query('UPDATE packages SET sort_order = ? WHERE id = ?', [target.sort_order, current.id]);
    await query('UPDATE packages SET sort_order = ? WHERE id = ?', [current.sort_order, target.id]);
    res.json({ success: true });
  } catch (err) { sendError(res, err, 'POST /:gameId/packages/:pkgId/move'); }
});

// ── SPECIAL PACKAGES ───────────────────────────────────────────────────────

router.get('/:gameId/special-packages', async (req, res) => {
  try {
    const [rows] = await query('SELECT * FROM special_packages WHERE game_id = ? ORDER BY sort_order ASC', [req.params.gameId]);
    res.json(rows);
  } catch (err) { sendError(res, err, 'GET /:gameId/special-packages'); }
});

router.post('/:gameId/special-packages', requireAdmin, async (req, res) => {
  const { gameId } = req.params;
  const b = req.body;
  const id = uuid();
  try {
    await query(
      `INSERT INTO special_packages (id, game_id, name, amount, price, icon, sort_order, label, label_bg_color, label_text_color, label_icon, g2bulk_product_id, g2bulk_type_id, quantity, points)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, gameId, b.name, String(b.amount), b.price, b.icon || null, 0, b.label || null, b.labelBgColor || null, b.labelTextColor || null, b.labelIcon || null, b.g2bulkProductId || null, b.g2bulkTypeId || null, b.quantity ?? null, b.points || 0]
    );
    const pkg = await queryOne('SELECT * FROM special_packages WHERE id = ?', [id]);
    res.json(pkg);
  } catch (err) { sendError(res, err, 'POST /:gameId/special-packages'); }
});

router.put('/:gameId/special-packages/:pkgId', requireAdmin, async (req, res) => {
  const { pkgId } = req.params;
  const b = req.body;
  const fieldMap = {
    name: 'name', amount: 'amount', price: 'price', icon: 'icon', sort_order: 'sort_order',
    label: 'label', labelBgColor: 'label_bg_color', labelTextColor: 'label_text_color',
    labelIcon: 'label_icon', g2bulkProductId: 'g2bulk_product_id', g2bulkTypeId: 'g2bulk_type_id',
    quantity: 'quantity', points: 'points',
  };
  const sets = [], values = [];
  for (const [k, col] of Object.entries(fieldMap)) {
    if (b[k] !== undefined) {
      sets.push(`${col} = ?`);
      values.push(k === 'amount' ? String(b[k]) : (b[k] === '' ? null : b[k]));
    }
  }
  if (sets.length === 0) return res.json({ success: true });
  values.push(pkgId);
  try {
    await query(`UPDATE special_packages SET ${sets.join(', ')} WHERE id = ?`, values);
    res.json({ success: true });
  } catch (err) { sendError(res, err, 'PUT /:gameId/special-packages/:pkgId'); }
});

router.delete('/:gameId/special-packages/:pkgId', requireAdmin, async (req, res) => {
  try {
    await query('DELETE FROM special_packages WHERE id = ?', [req.params.pkgId]);
    res.json({ success: true });
  } catch (err) { sendError(res, err, 'DELETE /:gameId/special-packages/:pkgId'); }
});

router.post('/:gameId/special-packages/:pkgId/move', requireAdmin, async (req, res) => {
  const { gameId, pkgId } = req.params;
  const { direction } = req.body;
  try {
    const pkgs = (await query('SELECT id, sort_order FROM special_packages WHERE game_id = ? ORDER BY sort_order ASC', [gameId]))[0];
    const idx = pkgs.findIndex(p => p.id === pkgId);
    if (idx === -1) return res.status(404).json({ error: 'Package not found' });
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= pkgs.length) return res.json({ success: true });
    const current = pkgs[idx], target = pkgs[targetIdx];
    await query('UPDATE special_packages SET sort_order = ? WHERE id = ?', [target.sort_order, current.id]);
    await query('UPDATE special_packages SET sort_order = ? WHERE id = ?', [current.sort_order, target.id]);
    res.json({ success: true });
  } catch (err) { sendError(res, err, 'POST /:gameId/special-packages/:pkgId/move'); }
});

module.exports = router;
