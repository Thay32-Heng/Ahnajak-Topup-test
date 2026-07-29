/**
 * routes/payments.cjs — payment gateways config + create-payment + webhooks
 * Replaces edge functions: get-ikhode-public-config, khqrcc-payment, khqrcc-webhook,
 * and payment gateway config from the old api-server.cjs
 */
const express = require('express');
const crypto = require('crypto');
const { query, queryOne } = require('../db.cjs');
const { requireAuth, requireAdmin, optionalAuth } = require('../auth.cjs');
const { sendError } = require('../helpers/errors.cjs');

const router = express.Router();

// ── Gateway config cache ────────────────────────────────────────────────────
let gatewayCache = {};
async function refreshGatewayCache() {
  try {
    const [rows] = await query('SELECT slug, name, enabled, config FROM payment_gateways');
    gatewayCache = {};
    for (const r of rows) {
      gatewayCache[r.slug] = {
        ...r,
        config: typeof r.config === 'string' ? JSON.parse(r.config) : r.config,
      };
    }
  } catch (err) {
    console.error('Gateway cache refresh error:', err.message);
  }
}
refreshGatewayCache();
setInterval(refreshGatewayCache, 300000);

// ── Public-safe gateway config (replaces get-ikhode-public-config edge fn) ──
// Accepts both GET and POST (functions.invoke sends POST)
async function handlePublicConfig(req, res) {
  const { slug } = req.params;
  const gw = gatewayCache[slug];
  if (!gw) return res.json({ success: true, enabled: false });
  const config = gw.config || {};
  res.json({
    success: true,
    id: gw.slug,
    enabled: !!gw.enabled,
    websocket_url: config.websocket_url || null,
    config: {
      websocket_url: config.websocket_url || null,
      profile_id: config.profile_id || null,
      checkout_url: config.checkout_url || null,
    }
  });
}
router.get('/public', async (req, res) => {
  const [rows] = await query('SELECT slug, name, enabled, config FROM payment_gateways WHERE enabled = 1');
  const list = (rows || []).map(r => ({
    slug: r.slug,
    name: r.name,
    enabled: !!r.enabled,
  }));
  res.json(list);
});

router.get('/public/:slug', handlePublicConfig);
router.post('/public/:slug', handlePublicConfig);

// ── Full gateway config (admin only) ──────────────────────────────────────
router.get('/', requireAuth, requireAdmin, async (req, res) => {
  try {
    const [rows] = await query('SELECT * FROM payment_gateways ORDER BY slug');
    res.json(rows);
  } catch (err) { sendError(res, err, 'GET /payment-gateways'); }
});

router.get('/:slug', requireAuth, requireAdmin, async (req, res) => {
  try {
    const row = await queryOne('SELECT * FROM payment_gateways WHERE slug = ?', [req.params.slug]);
    if (!row) return res.status(404).json({ error: 'Gateway not found' });
    res.json(row);
  } catch (err) { sendError(res, err, 'GET /payment-gateways/:slug'); }
});

router.put('/:slug', requireAuth, requireAdmin, async (req, res) => {
  const { slug } = req.params;
  const { name, enabled, config } = req.body;
  const sets = [], values = [];
  if (name !== undefined) { sets.push('name = ?'); values.push(name); }
  if (enabled !== undefined) { sets.push('enabled = ?'); values.push(enabled ? 1 : 0); }
  if (config !== undefined) { sets.push('config = ?'); values.push(JSON.stringify(config)); }
  if (!sets.length) return res.json({ success: true });
  values.push(slug);
  // Support both slug string and UUID id
  const where = slug.includes('-') ? 'id = ?' : 'slug = ?';
  try {
    await query(`UPDATE payment_gateways SET ${sets.join(', ')} WHERE ${where}`, values);
    await refreshGatewayCache();
    res.json({ success: true });
  } catch (err) { sendError(res, err, 'PUT /payment-gateways/:slug'); }
});

// ── Create payment URL (KHQRcc / ABA Pay) ─────────────────────────────────
// Also aliased as /api/khqrcc-payment for frontend compatibility
router.post('/create-payment', requireAuth, async (req, res) => {
  req.body = { ...req.body, action: 'create-payment' };
  return handleCreatePayment(req, res);
});
router.post('/khqrcc-payment', requireAuth, async (req, res) => {
  return handleCreatePayment(req, res);
});

async function handleCreatePayment(req, res) {
  const { orderId, amount, remark } = req.body;
  if (!orderId) return res.status(400).json({ error: 'orderId required' });

  // Validate amount against database order
  const dbOrder = await queryOne('SELECT amount FROM topup_orders WHERE id = ?', [orderId]);
  if (!dbOrder) return res.status(404).json({ error: 'Order not found' });
  const dbAmount = parseFloat(dbOrder.amount);
  const reqAmount = parseFloat(amount);
  if (!Number.isFinite(dbAmount) || !Number.isFinite(reqAmount) || Math.abs(dbAmount - reqAmount) > 0.01) {
    return res.status(400).json({ error: 'Amount mismatch' });
  }

  const gw = gatewayCache['khqrcc'];
  if (!gw || !gw.config?.secret_key || !gw.config?.profile_id) {
    await refreshGatewayCache();
    const refreshed = gatewayCache['khqrcc'];
    if (!refreshed?.config?.secret_key) return res.status(500).json({ error: 'Gateway not configured' });
  }
  const cfg = gatewayCache['khqrcc'].config;
  const success_url = req.body.success_url || `https://kesortopup.cam/success`;
  const plainHash = cfg.secret_key + orderId + amount + success_url + remark;
  const hash = crypto.createHash('sha1').update(plainHash).digest('hex');
  const params = new URLSearchParams({
    transaction_id: orderId,
    amount: String(amount),
    success_url,
    remark,
    hash,
  });
  const checkoutUrl = cfg.checkout_url || 'https://khqr.cc/api/payment/requestv2';
  res.json({ url: `${checkoutUrl}/${cfg.profile_id}?${params.toString()}` });
}

// ── KHQRcc webhook ─────────────────────────────────────────────────────────
router.post('/khqrcc-webhook', async (req, res) => {
  const { transaction_id, amount, status, req_time, hash: received_hash } = req.body;
  const gw = gatewayCache['khqrcc'];
  if (!gw?.config?.secret_key) {
    await refreshGatewayCache();
  }
  const cfg = gatewayCache['khqrcc']?.config;
  if (!cfg?.secret_key) return res.status(500).send('Config missing');

  const dataToHash = cfg.secret_key + (req_time || '') + (transaction_id || '') + (amount || '') + (status || '');
  const expectedHash = crypto.createHash('sha256').update(dataToHash).digest('hex');

  if (expectedHash !== received_hash) {
    return res.status(403).send('Invalid hash');
  }

  if (status === 'SUCCESS') {
    // Idempotency check: skip if already paid
    const existingOrder = await queryOne('SELECT status, amount FROM topup_orders WHERE id = ?', [transaction_id]);
    if (!existingOrder) return res.status(404).json({ error: 'Order not found' });
    if (existingOrder.status === 'paid' || existingOrder.status === 'completed') {
      return res.status(200).json({ received: true, status: 'already_processed' });
    }

    // Verify the amount paid matches the database order amount (price-tampering prevention)
    const paidAmount = parseFloat(amount);
    const expectedAmount = parseFloat(existingOrder.amount);
    if (isNaN(paidAmount) || isNaN(expectedAmount) || Math.abs(paidAmount - expectedAmount) > 0.01) {
      return res.status(400).json({ error: 'Payment amount mismatch' });
    }

    await query('UPDATE topup_orders SET status = ? WHERE id = ?', ['paid', transaction_id]);

    // Trigger fulfillment (call process-topup internally)
    try {
      const processTopup = require('./process-topup.cjs');
      await processTopup.fulfillOrder(transaction_id);
    } catch (err) {
      console.error('Fulfillment trigger error:', err.message);
    }

    return res.status(200).json({ received: true });
  }

  res.status(400).send('Not success');
});

// ── Payment QR settings (admin CRUD) ────────────────────────────────────────
router.get('/qr-settings', async (req, res) => {
  try {
    const [rows] = await query('SELECT * FROM payment_qr_settings');
    res.json(rows);
  } catch (err) { sendError(res, err, 'GET /payment-gateways/qr-settings'); }
});

router.delete('/qr-settings', requireAdmin, async (req, res) => {
  try {
    await query('DELETE FROM payment_qr_settings');
    res.json({ success: true });
  } catch (err) { sendError(res, err, 'DELETE /payment-gateways/qr-settings'); }
});

router.put('/qr-settings/:id', requireAdmin, async (req, res) => {
  const { id } = req.params;
  const sets = [], values = [];
  for (const f of ['payment_method', 'qr_code_image', 'bank_name', 'account_name', 'account_number', 'instructions', 'is_enabled']) {
    if (req.body[f] !== undefined) { sets.push(`${f} = ?`); values.push(req.body[f]); }
  }
  if (!sets.length) return res.json({ success: true });
  values.push(id);
  try { await query(`UPDATE payment_qr_settings SET ${sets.join(', ')} WHERE id = ?`, values); res.json({ success: true }); }
  catch (err) { sendError(res, err, 'PUT /payment-gateways/qr-settings/:id'); }
});

module.exports = router;
