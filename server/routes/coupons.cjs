/**
 * routes/coupons.cjs — coupon validation + apply (replaces RPC apply_coupon)
 * POST /api/coupons/apply  { code, order_amount }  → { success, discount_amount }
 * GET  /api/coupons         — list user's coupons (auth)
 */
const express = require('express');
const { query, queryOne, uuid } = require('../db.cjs');
const { requireAuth } = require('../auth.cjs');
const { sendError } = require('../helpers/errors.cjs');

const router = express.Router();

// Apply coupon (auth — needs user_id to validate ownership)
router.post('/apply', requireAuth, async (req, res) => {
  const { code, order_amount, order_id } = req.body;
  if (!code) return res.status(400).json({ success: false, message: 'Coupon code required' });

  try {
    // Validate order_id — prevent coupon use without a real order
    if (!order_id) return res.json({ success: false, message: 'Order ID required' });
    const targetOrder = await queryOne('SELECT id FROM topup_orders WHERE id = ?', [order_id]);
    if (!targetOrder) return res.json({ success: false, message: 'Order not found' });

    // Atomically mark coupon as used — prevents race condition (double-use)
    const result = await query(
      `UPDATE coupons SET is_used = 1, used_at = NOW(), order_id = ? WHERE code = ? AND user_id = ? AND is_used = 0
       AND (expires_at IS NULL OR expires_at > NOW())`,
      [order_id, code.trim().toUpperCase(), req.user.id]
    );
    if (result[0].affectedRows === 0) {
      return res.json({ success: false, message: 'Invalid, expired, or already used coupon' });
    }

    const coupon = await queryOne('SELECT * FROM coupons WHERE code = ? AND user_id = ?', [code.trim().toUpperCase(), req.user.id]);
    if (!coupon) {
      return res.json({ success: false, message: 'Invalid, expired, or already used coupon' });
    }

    let discount = 0;
    if (coupon.discount_type === 'fixed') {
      discount = parseFloat(coupon.discount_value);
    } else if (coupon.discount_type === 'percent') {
      discount = (parseFloat(order_amount) * parseFloat(coupon.discount_value)) / 100;
    }

    if (discount > parseFloat(order_amount)) {
      discount = parseFloat(order_amount);
    }

    res.json({ success: true, discount_amount: discount });
  } catch (err) { sendError(res, err, 'POST /coupons/apply'); }
});

// List user's coupons (auth)
router.get('/', requireAuth, async (req, res) => {
  try {
    const [rows] = await query('SELECT * FROM coupons WHERE user_id = ? ORDER BY created_at DESC', [req.user.id]);
    res.json(rows);
  } catch (err) { sendError(res, err, 'GET /coupons'); }
});

module.exports = router;
