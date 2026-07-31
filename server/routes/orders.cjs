/**
 * routes/orders.cjs — topup_orders CRUD + polling endpoint (replaces Supabase Realtime)
 */
const express = require('express');
const { query, queryOne, uuid } = require('../db.cjs');
const { requireAuth, requireAdmin, optionalAuth, hasRole } = require('../auth.cjs');
const { sendError } = require('../helpers/errors.cjs');

const router = express.Router();

// List orders — admin gets all, user gets their own
router.get('/', requireAuth, async (req, res) => {
  try {
    const isAdmin = await hasRole(req.user.id, 'admin');
    let rows;
    if (isAdmin) {
      [rows] = await query('SELECT * FROM topup_orders ORDER BY created_at DESC LIMIT 500');
    } else {
      [rows] = await query('SELECT * FROM topup_orders WHERE user_id = ? ORDER BY created_at DESC', [req.user.id]);
    }
    res.json(rows);
  } catch (err) { sendError(res, err, 'GET /orders'); }
});

// Polling endpoint for the realtime order widget (admin only)
router.get('/recent', requireAuth, async (req, res) => {
  try {
    const isAdmin = await hasRole(req.user.id, 'admin');
    if (!isAdmin) return res.status(403).json({ error: 'Admin access required' });
    const [rows] = await query(
      'SELECT id, game_name, package_name, player_id, amount, currency, status, created_at, updated_at FROM topup_orders ORDER BY created_at DESC LIMIT 10'
    );
    res.json(rows);
  } catch (err) { sendError(res, err, 'GET /orders/recent'); }
});

// Get single order by id
router.get('/:id', optionalAuth, async (req, res) => {
  try {
    const order = await queryOne('SELECT * FROM topup_orders WHERE id = ?', [req.params.id]);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    
    if (order.user_id) {
      if (!req.user) return res.status(401).json({ error: 'Authentication required' });
      const isAdmin = await hasRole(req.user.id, 'admin');
      if (order.user_id !== req.user.id && !isAdmin) {
        return res.status(403).json({ error: 'Access denied' });
      }
    }
    
    res.json(order);
  } catch (err) { sendError(res, err, 'GET /orders/:id'); }
});

// Create order (auth optional — guests allowed)
router.post('/', optionalAuth, async (req, res) => {
  const b = req.body;
  // Voucher/Gift Card orders have no player_id
  const isCardProduct = !!b.g2bulk_product_id && String(b.g2bulk_product_id).startsWith('card_');
  if (!isCardProduct && (!b.player_id || String(b.player_id).length > 100)) {
    return res.status(400).json({ error: 'Invalid or too long player_id' });
  }
  const id = uuid();
  try {
    // Pricing protection: Retrieve actual price from the database to prevent pricing tampering
    let dbPrice = null;
    let pkg = null;
    
    if (isCardProduct) {
      // Card/VG products: validate authoritatively against g2bulk_products table
      const gp = await queryOne(
        'SELECT price, is_active FROM g2bulk_products WHERE g2bulk_product_id = ?',
        [b.g2bulk_product_id]
      );
      if (!gp || gp.is_active !== 1 || Number(gp.price) <= 0) {
        return res.status(400).json({ error: 'Invalid card product selection' });
      }
      dbPrice = parseFloat(gp.price);
    } else if (b.g2bulk_product_id && b.game_name && b.package_name) {
      pkg = await queryOne(
        'SELECT p.price FROM packages p JOIN games g ON g.id = p.game_id WHERE p.g2bulk_product_id = ? AND g.name = ? AND p.name = ?',
        [b.g2bulk_product_id, b.game_name, b.package_name]
      );
      if (!pkg) {
        pkg = await queryOne(
          'SELECT sp.price FROM special_packages sp JOIN games g ON g.id = sp.game_id WHERE sp.g2bulk_product_id = ? AND g.name = ? AND sp.name = ?',
          [b.g2bulk_product_id, b.game_name, b.package_name]
        );
      }
    }
    
    if (!pkg && b.game_name && b.package_name) {
      const game = await queryOne('SELECT id FROM games WHERE name = ?', [b.game_name]);
      if (game) {
        pkg = await queryOne('SELECT price FROM packages WHERE game_id = ? AND name = ?', [game.id, b.package_name]);
        if (!pkg) {
          pkg = await queryOne('SELECT price FROM special_packages WHERE game_id = ? AND name = ?', [game.id, b.package_name]);
        }
      }
    }
    
    if (pkg) {
      dbPrice = parseFloat(pkg.price);
    }
    
    if (dbPrice === null) {
      return res.status(400).json({ error: 'Invalid package — could not verify price' });
    }
    
    const finalAmount = dbPrice;

    // Validate client-provided amount against DB price (price-tampering prevention)
    if (Number(b.amount) && Number.isFinite(Number(b.amount)) && Math.abs(Number(b.amount) - dbPrice) > 0.0001) {
      return res.status(400).json({ error: 'Amount does not match package price' });
    }

    await query(
      `INSERT INTO topup_orders (id, user_id, game_name, package_name, player_id, server_id, player_name, amount, currency, payment_method, g2bulk_product_id, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
      [id, req.user?.id || null, b.game_name, b.package_name, b.player_id, b.server_id || null, b.player_name || null, finalAmount, b.currency || 'USD', b.payment_method || null, b.g2bulk_product_id || null]
    );
    const order = await queryOne('SELECT * FROM topup_orders WHERE id = ?', [id]);
    res.json(order);
  } catch (err) { sendError(res, err, 'POST /orders'); }
});

// Update order status (admin only)
router.put('/:id', requireAdmin, async (req, res) => {
  const { id } = req.params;
  const allowed = ['status', 'status_message', 'g2bulk_order_id', 'card_codes', 'payment_method'];
  const sets = [], values = [];
  for (const f of allowed) {
    if (req.body[f] !== undefined) {
      sets.push(`${f} = ?`);
      values.push(f === 'card_codes' ? JSON.stringify(req.body[f]) : req.body[f]);
    }
  }
  if (sets.length === 0) return res.json({ success: true });
  values.push(id);
  try {
    await query(`UPDATE topup_orders SET ${sets.join(', ')} WHERE id = ?`, values);
    res.json({ success: true });
  } catch (err) { sendError(res, err, 'PUT /orders/:id'); }
});

module.exports = router;
