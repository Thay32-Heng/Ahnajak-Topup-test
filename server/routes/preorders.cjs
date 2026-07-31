/**
 * routes/preorders.cjs — preorder_games, preorder_packages, preorder_orders CRUD
 */
const express = require('express');
const { query, queryOne, uuid } = require('../db.cjs');
const { requireAuth, requireAdmin, optionalAuth } = require('../auth.cjs');
const { sendError } = require('../helpers/errors.cjs');

const router = express.Router();

// ── PREORDER GAMES ──────────────────────────────────────────────────────────
router.get('/games', async (req, res) => {
  try {
    const [rows] = await query(`
      SELECT pg.*, g.name as game_name, g.image as game_image, g.slug as game_slug
      FROM preorder_games pg
      JOIN games g ON g.id = pg.game_id
      ORDER BY pg.sort_order ASC
    `);
    res.json(rows);
  } catch (err) { sendError(res, err, 'GET /preorders/games'); }
});

router.post('/games', requireAdmin, async (req, res) => {
  const { game_id, is_active, sort_order } = req.body;
  const id = uuid();
  try {
    await query('INSERT INTO preorder_games (id, game_id, is_active, sort_order) VALUES (?, ?, ?, ?)',
      [id, game_id, is_active ?? 1, sort_order ?? 0]);
    res.json({ id, game_id, is_active: is_active ?? 1, sort_order: sort_order ?? 0 });
  } catch (err) { sendError(res, err, 'POST /preorders/games'); }
});

router.put('/games/:id', requireAdmin, async (req, res) => {
  const { id } = req.params;
  const sets = [], values = [];
  for (const f of ['is_active', 'sort_order']) {
    if (req.body[f] !== undefined) { sets.push(`${f} = ?`); values.push(req.body[f]); }
  }
  if (!sets.length) return res.json({ success: true });
  values.push(id);
  try { await query(`UPDATE preorder_games SET ${sets.join(', ')} WHERE id = ?`, values); res.json({ success: true }); }
  catch (err) { sendError(res, err, 'PUT /preorders/games/:id'); }
});

router.delete('/games/:id', requireAdmin, async (req, res) => {
  try { await query('DELETE FROM preorder_games WHERE id = ?', [req.params.id]); res.json({ success: true }); }
  catch (err) { sendError(res, err, 'DELETE /preorders/games/:id'); }
});

// ── PREORDER PACKAGES ───────────────────────────────────────────────────────
router.get('/packages', async (req, res) => {
  try {
    const { gameId } = req.query;
    const sql = gameId
      ? 'SELECT * FROM preorder_packages WHERE game_id = ? ORDER BY sort_order ASC'
      : 'SELECT * FROM preorder_packages ORDER BY sort_order ASC';
    const [rows] = await query(sql, gameId ? [gameId] : []);
    res.json(rows);
  } catch (err) { sendError(res, err, 'GET /preorders/packages'); }
});

router.post('/packages', requireAdmin, async (req, res) => {
  const b = req.body;
  const id = uuid();
  try {
    await query(
      `INSERT INTO preorder_packages (id, game_id, name, amount, price, icon, sort_order, label, label_bg_color, label_text_color, label_icon, g2bulk_product_id, g2bulk_type_id, quantity, scheduled_fulfill_at, points)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, b.game_id, b.name, String(b.amount), b.price, b.icon || null, b.sort_order || 0, b.label || null, b.labelBgColor || null, b.labelTextColor || null, b.labelIcon || null, b.g2bulkProductId || null, b.g2bulkTypeId || null, b.quantity ?? null, b.scheduledFulfillAt || null, b.points || 0]
    );
    res.json(await queryOne('SELECT * FROM preorder_packages WHERE id = ?', [id]));
  } catch (err) { sendError(res, err, 'POST /preorders/packages'); }
});

router.put('/packages/:id', requireAdmin, async (req, res) => {
  const { id } = req.params;
  const b = req.body;
  const fieldMap = {
    name: 'name', amount: 'amount', price: 'price', icon: 'icon', sort_order: 'sort_order',
    label: 'label', labelBgColor: 'label_bg_color', labelTextColor: 'label_text_color',
    labelIcon: 'label_icon', g2bulkProductId: 'g2bulk_product_id', g2bulkTypeId: 'g2bulk_type_id',
    quantity: 'quantity', scheduledFulfillAt: 'scheduled_fulfill_at', points: 'points',
  };
  const sets = [], values = [];
  for (const [k, col] of Object.entries(fieldMap)) {
    if (b[k] !== undefined) {
      sets.push(`${col} = ?`);
      values.push(k === 'amount' ? String(b[k]) : (b[k] === '' ? null : b[k]));
    }
  }
  if (!sets.length) return res.json({ success: true });
  values.push(id);
  try { await query(`UPDATE preorder_packages SET ${sets.join(', ')} WHERE id = ?`, values); res.json({ success: true }); }
  catch (err) { sendError(res, err, 'PUT /preorders/packages/:id'); }
});

router.delete('/packages/:id', requireAdmin, async (req, res) => {
  try { await query('DELETE FROM preorder_packages WHERE id = ?', [req.params.id]); res.json({ success: true }); }
  catch (err) { sendError(res, err, 'DELETE /preorders/packages/:id'); }
});

// ── PREORDER ORDERS ─────────────────────────────────────────────────────────
router.get('/orders', requireAuth, async (req, res) => {
  try {
    const { hasRole } = require('../auth.cjs');
    const isAdmin = await hasRole(req.user.id, 'admin');
    const sql = isAdmin
      ? 'SELECT * FROM preorder_orders ORDER BY created_at DESC LIMIT 500'
      : 'SELECT * FROM preorder_orders WHERE user_id = ? ORDER BY created_at DESC';
    const [rows] = await query(sql, isAdmin ? [] : [req.user.id]);
    res.json(rows);
  } catch (err) { sendError(res, err, 'GET /preorders/orders'); }
});

// Get single preorder order by id
router.get('/orders/:id', optionalAuth, async (req, res) => {
  try {
    const order = await queryOne('SELECT * FROM preorder_orders WHERE id = ?', [req.params.id]);
    if (!order) return res.status(404).json({ error: 'Order not found' });

    // Only the owner or an admin may view the full order — mask sensitive fields otherwise
    let canViewFull = false;
    if (order.user_id) {
      if (!req.user) return res.status(401).json({ error: 'Authentication required' });
      const { hasRole } = require('../auth.cjs');
      const isAdmin = await hasRole(req.user.id, 'admin');
      if (order.user_id !== req.user.id && !isAdmin) {
        return res.status(403).json({ error: 'Access denied' });
      }
      canViewFull = true;
    } else if (req.user) {
      const { hasRole } = require('../auth.cjs');
      const isAdmin = await hasRole(req.user.id, 'admin');
      canViewFull = isAdmin;
    }

    if (!canViewFull) {
      const { card_codes, g2bulk_order_id, user_id, ...safe } = order;
      return res.json(safe);
    }
    res.json(order);
  } catch (err) { sendError(res, err, 'GET /preorders/orders/:id'); }
});

router.post('/orders', optionalAuth, async (req, res) => {
  const b = req.body;
  const id = uuid();
  try {
    // Pricing protection: Retrieve actual price from the database to prevent pricing tampering
    let dbPrice = null;
    let pkg = null;
    
    if (b.g2bulk_product_id) {
      pkg = await queryOne('SELECT price FROM preorder_packages WHERE g2bulk_product_id = ?', [b.g2bulk_product_id]);
    }
    
    if (!pkg && b.game_name && b.package_name) {
      const game = await queryOne('SELECT id FROM games WHERE name = ?', [b.game_name]);
      if (game) {
        pkg = await queryOne('SELECT price FROM preorder_packages WHERE game_id = ? AND name = ?', [game.id, b.package_name]);
      }
    }
    
    if (pkg) {
      dbPrice = parseFloat(pkg.price);
    }
    
    if (dbPrice === null) {
      return res.status(400).json({ error: 'Invalid package — could not verify price' });
    }
    
    const finalAmount = dbPrice;

    await query(
      `INSERT INTO preorder_orders (id, user_id, game_name, package_name, player_id, server_id, player_name, amount, currency, payment_method, g2bulk_product_id, status, scheduled_fulfill_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, req.user?.id || null, b.game_name, b.package_name, b.player_id, b.server_id || null, b.player_name || null, finalAmount, b.currency || 'USD', b.payment_method || null, b.g2bulk_product_id || null, b.status || 'notpaid', b.scheduledFulfillAt || null]
    );
    res.json(await queryOne('SELECT * FROM preorder_orders WHERE id = ?', [id]));
  } catch (err) { sendError(res, err, 'POST /preorders/orders'); }
});

router.put('/orders/:id', requireAdmin, async (req, res) => {
  const { id } = req.params;
  const allowed = ['status', 'status_message', 'g2bulk_order_id', 'card_codes', 'scheduled_fulfill_at'];
  const sets = [], values = [];
  for (const f of allowed) {
    if (req.body[f] !== undefined) {
      sets.push(`${f} = ?`);
      values.push(f === 'card_codes' ? JSON.stringify(req.body[f]) : req.body[f]);
    }
  }
  if (!sets.length) return res.json({ success: true });
  values.push(id);
  try { await query(`UPDATE preorder_orders SET ${sets.join(', ')} WHERE id = ?`, values); res.json({ success: true }); }
  catch (err) { sendError(res, err, 'PUT /preorders/orders/:id'); }
});

module.exports = router;
