/**
 * routes/ikhode.cjs — IKhode Bakong KHQR payment
 * Ports the Supabase edge function `ikhode-payment`.
 * POST /api/ikhode-payment  body: { action, ... }
 */
const express = require('express');
const { query, queryOne } = require('../db.cjs');
const { requireAuth, optionalAuth } = require('../auth.cjs');

const router = express.Router();

async function loadConfig() {
  const row = await queryOne(`SELECT config, enabled FROM payment_gateways WHERE slug = 'ikhode-bakong'`);
  if (!row || !row.enabled) return null;
  return typeof row.config === 'string' ? JSON.parse(row.config) : row.config || {};
}

router.post('/', optionalAuth, async (req, res) => {
  const cfg = await loadConfig();
  if (!cfg) return res.json({ success: false, error: 'IKhode gateway not configured or disabled' });

  const { action, ...params } = req.body;

  try {
    if (action === 'generate-qr') {
      const { orderId, amount } = params;
      if (!orderId || !amount) return res.json({ success: false, error: 'orderId and amount required' });

      // Validate amount against database order to prevent tampering
      const order = await queryOne('SELECT amount FROM topup_orders WHERE id = ?', [orderId]);
      if (!order) return res.json({ success: false, error: 'Order not found' });
      const dbAmount = parseFloat(order.amount);
      const reqAmount = parseFloat(amount);
      if (!Number.isFinite(dbAmount) || !Number.isFinite(reqAmount) || Math.abs(dbAmount - reqAmount) > 0.01) {
        return res.json({ success: false, error: 'Amount mismatch' });
      }

      const nodeApiUrl = cfg.node_api_url;
      const webhookSecret = cfg.webhook_secret;
      const customWebhookUrl = cfg.custom_webhook_url;

      if (!nodeApiUrl) return res.json({ success: false, error: 'IKhode node_api_url not configured' });
      try {
        const parsedUrl = new URL(nodeApiUrl);
        if (parsedUrl.protocol !== 'https:') {
          return res.status(400).json({ error: 'Invalid gateway URL' });
        }
      } catch {
        return res.status(400).json({ error: 'Invalid gateway URL' });
      }

      // Call IKhode API to generate QR
      const response = await fetch(`${nodeApiUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: parseFloat(amount),
          currency: 'USD',
          order_id: orderId,
          secret: webhookSecret,
          webhook_url: customWebhookUrl,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (data.qr_code || data.qrCode) {
        return res.json({ success: true, qrCodeData: data.qr_code || data.qrCode, orderId, amount });
      }
      return res.json({ success: false, error: data.message || 'Failed to generate QR' });
    }

    if (action === 'check-status') {
      const { orderId } = params;
      if (!orderId) return res.json({ success: false, error: 'orderId required' });

      const nodeApiUrl = cfg.node_api_url;
      if (!nodeApiUrl) return res.json({ success: false, error: 'IKhode not configured' });
      try {
        const parsedUrl = new URL(nodeApiUrl);
        if (parsedUrl.protocol !== 'https:') {
          return res.status(400).json({ error: 'Invalid gateway URL' });
        }
      } catch {
        return res.status(400).json({ error: 'Invalid gateway URL' });
      }

      const response = await fetch(`${nodeApiUrl}/api/check`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_id: orderId }),
      });
      const data = await response.json().catch(() => ({}));
      return res.json(data);
    }

    return res.json({ success: false, error: `Unknown action: ${action}` });
  } catch (err) {
    console.error('[IKhode] Error:', err.message);
    return res.json({ success: false, error: err.message });
  }
});

// Webhook handled by payments.cjs

module.exports = router;