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

module.exports = router;