/**
 * routes/misc.cjs — Edge function aliases
 * POST /api/get-ikhode-public-config
 * POST /api/khqrcc-payment
 * POST /api/khqrcc-webhook
 * POST /api/g2bulk-webhook
 */
const express = require('express');
const { sendError } = require('../helpers/errors.cjs');

const router = express.Router();
const { queryOne } = require('../db.cjs');

// ── Edge function aliases (for compatibility shim) ────────────────────────
// get-ikhode-public-config (was edge function)
router.post('/get-ikhode-public-config', async (req, res) => {
  try {
    const row = await queryOne(`SELECT enabled, config FROM payment_gateways WHERE slug = 'ikhode-bakong'`);
    if (!row) return res.json({ success: true, enabled: false });
    const config = typeof row.config === 'string' ? JSON.parse(row.config) : row.config || {};
    res.json({ success: true, enabled: !!row.enabled, websocket_url: config.websocket_url || null });
  } catch (err) { sendError(res, err, 'POST /get-ikhode-public-config'); }
});

// khqrcc-payment (forward to payments create-payment handler)
router.post('/khqrcc-payment', async (req, res) => {
  const crypto = require('crypto');
  const { orderId, amount, remark, returnUrl } = req.body;
  try {
    const gw = await queryOne(`SELECT config, enabled FROM payment_gateways WHERE slug = 'khqrcc'`);
    if (!gw || !gw.enabled) return res.status(400).json({ error: 'Gateway disabled or not found' });
    const cfg = typeof gw.config === 'string' ? JSON.parse(gw.config) : gw.config || {};
    if (!cfg.secret_key || !cfg.profile_id || !cfg.checkout_url) {
      return res.status(400).json({ error: 'Gateway not configured' });
    }
    const success_url = returnUrl || `${process.env.PUBLIC_BASE_URL || 'http://localhost:9911'}/api/khqrcc-webhook?transaction_id=${orderId}`;
    const plainHash = cfg.secret_key + orderId + amount + success_url + (remark || '');
    const hash = crypto.createHash('sha1').update(plainHash).digest('hex');
    const params = new URLSearchParams({ transaction_id: String(orderId), amount: String(amount), success_url, remark: remark || '', hash });
    res.json({ url: `${cfg.checkout_url}/${cfg.profile_id}?${params.toString()}` });
  } catch (err) { sendError(res, err, 'POST /khqrcc-payment'); }
});

// khqrcc-webhook (external callback)
router.post('/khqrcc-webhook', async (req, res) => {
  const expectedSecret = process.env.G2BULK_WEBHOOK_SECRET;
  if (expectedSecret) {
    const provided = req.headers['x-webhook-secret'] || '';
    if (provided !== expectedSecret) return res.status(401).send('Invalid webhook secret');
  }
  const crypto = require('crypto');
  const { transaction_id, amount, status, req_time, hash: received_hash } = req.body;
  try {
    const gw = await queryOne(`SELECT config FROM payment_gateways WHERE slug = 'khqrcc'`);
    const cfg = typeof gw?.config === 'string' ? JSON.parse(gw.config) : gw?.config || {};
    if (!cfg.secret_key) return res.status(500).send('Config missing');
    const dataToHash = cfg.secret_key + (req_time || '') + (transaction_id || '') + (amount || '') + (status || '');
    const expectedHash = crypto.createHash('sha256').update(dataToHash).digest('hex');
    if (expectedHash !== received_hash) return res.status(403).send('Invalid hash');
    if (status === 'SUCCESS') {
      const order = await queryOne('SELECT amount FROM topup_orders WHERE id = ?', [transaction_id]);
      if (!order) return res.status(404).json({ error: 'Order not found' });
      const paidAmount = parseFloat(amount);
      const expectedAmount = parseFloat(order.amount);
      if (isNaN(paidAmount) || isNaN(expectedAmount) || Math.abs(paidAmount - expectedAmount) > 0.01) {
        return res.status(400).json({ error: 'Payment amount mismatch' });
      }
      const { query } = require('../db.cjs');
      await query('UPDATE topup_orders SET status = ? WHERE id = ?', ['paid', transaction_id]);
      try { const pt = require('./process-topup.cjs'); if (pt.fulfillOrder) await pt.fulfillOrder(transaction_id); } catch (e) { console.error('Fulfill error:', e.message); }
      return res.json({ received: true });
    }
    res.status(400).send('Not success');
  } catch (err) { sendError(res, err, 'POST /khqrcc-webhook'); }
});

// g2bulk-webhook (G2Bulk callback)
router.post('/g2bulk-webhook', async (req, res) => {
  const expectedSecret = process.env.G2BULK_WEBHOOK_SECRET;
  if (expectedSecret) {
    const provided = req.headers['x-webhook-secret'] || '';
    if (provided !== expectedSecret) return res.status(401).json({ error: 'Invalid webhook secret' });
  }
  const body = req.body || {};
  const remark = body.remark || '';
  const orderMatch = remark.match(/order_id:([a-f0-9-]+)/);
  if (!orderMatch) return res.json({ received: true, note: 'No order_id in remark' });
  const orderId = orderMatch[1];
  const g2bulkStatus = body.status || '';
  const { query } = require('../db.cjs');
  let order = await queryOne('SELECT * FROM topup_orders WHERE id = ?', [orderId]);
  let table = 'topup_orders';
  if (!order) { order = await queryOne('SELECT * FROM preorder_orders WHERE id = ?', [orderId]); table = 'preorder_orders'; }
  if (!order) return res.json({ received: true, note: 'Order not found' });
  let newStatus = order.status;
  if (['COMPLETED', 'completed'].includes(g2bulkStatus)) newStatus = 'completed';
  else if (['FAILED', 'failed', 'CANCELLED'].includes(g2bulkStatus)) newStatus = 'failed';
  await query(`UPDATE ${table} SET status = ?, status_message = ? WHERE id = ?`, [newStatus, `G2Bulk callback: ${g2bulkStatus}`, orderId]);
  res.json({ received: true, orderId, newStatus });
});

module.exports = router;