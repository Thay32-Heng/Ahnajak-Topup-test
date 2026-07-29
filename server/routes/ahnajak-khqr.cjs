/**
 * routes/ahnajak-khqr.cjs — KHQR payment generation via Ahnajak gateway
 * Ports the Supabase edge function `ahnajak-khqr`.
 * POST /api/ahnajak-khqr  body: { action: 'generate-qr'|'check-status'|'test-connection', ... }
 */
const express = require('express');
const { query, queryOne } = require('../db.cjs');
const { requireAuth } = require('../auth.cjs');
const QRCode = require('qrcode');

const router = express.Router();
const PAID_STATES = new Set(['paid', 'success', 'completed', 'succeeded']);

async function loadConfig() {
  const row = await queryOne(`SELECT config, enabled FROM payment_gateways WHERE slug = 'ahnajak-khqr'`);
  if (!row || !row.enabled) return null;
  const cfg = typeof row.config === 'string' ? JSON.parse(row.config) : row.config || {};
  if (!cfg.api_key) return null;
  return cfg;
}

function baseUrl(cfg) {
  return (cfg.base_url || 'https://apikhqr.kesor.cam').replace(/\/$/, '') + '/api/v1';
}

function isPaidStatus(payload) {
  if (!payload) return false;
  const candidates = [payload.status, payload?.transaction?.status, payload?.data?.status, payload?.data?.transaction?.status];
  if (candidates.some(s => typeof s === 'string' && PAID_STATES.has(s.toLowerCase()))) return true;
  if (payload.paid === true || payload.is_paid === true) return true;
  if (payload?.data?.paid === true || payload?.data?.is_paid === true) return true;
  return false;
}

async function findOrder(orderId) {
  let order = await queryOne('SELECT id, amount, status FROM topup_orders WHERE id = ?', [orderId]);
  if (order) return { table: 'topup_orders', ...order };
  order = await queryOne('SELECT id, amount, status FROM preorder_orders WHERE id = ?', [orderId]);
  if (order) return { table: 'preorder_orders', ...order };
  return null;
}

async function markPaid(table, orderId, txId) {
  const result = await query(
    `UPDATE ${table} SET status = ?, payment_method = ?, g2bulk_order_id = IFNULL(g2bulk_order_id, ?), updated_at = NOW()
     WHERE id = ? AND status IN ('pending', 'notpaid', 'awaiting_payment')`,
    ['paid', 'KHQR', txId || null, orderId]
  );
  if (result[0].affectedRows > 0) {
    try {
      const processTopup = require('./process-topup.cjs');
      processTopup.fulfillOrder(orderId, table === 'preorder_orders').catch(e => {
        console.error('[ahnajak-khqr] Fulfillment error:', e.message);
      });
    } catch (e) {
      console.error('[ahnajak-khqr] Fulfillment trigger error:', e.message);
    }
  }
  return result[0].affectedRows > 0;
}

router.post('/', requireAuth, async (req, res) => {
  const body = req.body;
  const action = body?.action;
  if (!action) return res.status(400).json({ error: 'Missing action' });

  const cfg = await loadConfig();
  if (!cfg) return res.status(400).json({ error: 'KHQR gateway not configured' });
  const api = baseUrl(cfg);
  const authHeader = { Authorization: `Bearer ${cfg.api_key}`, 'Content-Type': 'application/json' };

  try {
    if (action === 'test-connection') {
      const r = await fetch(`${api}/me`, { headers: authHeader });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) return res.json({ success: false, error: data?.message || `HTTP ${r.status}` });
      return res.json({ success: true, merchant: data?.merchant ?? null });
    }

    if (action === 'generate-qr') {
      const { orderId } = body;
      if (!orderId) return res.status(400).json({ error: 'orderId is required' });
      const order = await findOrder(orderId);
      if (!order) return res.status(404).json({ error: 'Order not found' });

      const amount = Math.round(Number(order.amount) * 100) / 100;
      const billNumber = `ORD-${String(orderId).slice(0, 8)}-${Date.now().toString().slice(-6)}`.slice(0, 25);

      const qrReq = await fetch(`${api}/qr`, {
        method: 'POST',
        headers: authHeader,
        body: JSON.stringify({
          amount, currency: 'USD', bill_number: billNumber,
          order_id: String(orderId).slice(0, 64),
          expires_in_seconds: body.expires_in_seconds ?? 900,
          ...(cfg.merchant_name ? { store_label: cfg.merchant_name.slice(0, 25) } : {}),
        }),
      });
      const qrJson = await qrReq.json().catch(() => ({}));
      if (!qrReq.ok || !qrJson?.qr) {
        return res.status(502).json({ error: qrJson?.message || `Gateway error ${qrReq.status}` });
      }

      const qrCodeData = await QRCode.toDataURL(qrJson.qr, { width: 512, margin: 1 });
      return res.json({ qrCodeData, qrString: qrJson.qr, md5: qrJson.md5, orderId, amount, currency: qrJson.currency || 'USD' });
    }

    if (action === 'check-status') {
      const { orderId, md5 } = body;
      if (!orderId && !md5) return res.status(400).json({ error: 'orderId or md5 required' });

      let gatewayPayload = null;
      if (md5) {
        const r = await fetch(`${api}/transaction/check`, { method: 'POST', headers: authHeader, body: JSON.stringify({ md5 }) });
        gatewayPayload = await r.json().catch(() => ({}));
      }
      if (!isPaidStatus(gatewayPayload) && orderId) {
        const r = await fetch(`${api}/transaction/by-order`, { method: 'POST', headers: authHeader, body: JSON.stringify({ order_id: String(orderId).slice(0, 64) }) });
        const byOrder = await r.json().catch(() => ({}));
        if (isPaidStatus(byOrder)) gatewayPayload = byOrder;
      }

      const paid = isPaidStatus(gatewayPayload);
      if (paid && orderId) {
        const order = await findOrder(orderId);
        if (order && !['paid', 'processing', 'completed', 'failed'].includes(String(order.status).toLowerCase())) {
          const gwAmount = Number(gatewayPayload?.amount ?? gatewayPayload?.data?.amount ?? NaN);
          if (!Number.isFinite(gwAmount) || Math.abs(gwAmount - Number(order.amount)) > 0.01) {
            console.warn('[ahnajak-khqr] Amount mismatch or missing on check', { orderId, dbAmount: order.amount, gwAmount });
          } else {
            await markPaid(order.table, orderId, gatewayPayload?.transaction_id);
          }
        }
      }

      const order = orderId ? await findOrder(orderId) : null;
      return res.json({ status: order?.status ?? (paid ? 'paid' : 'pending'), gateway_status: paid ? 'paid' : 'pending', orderId });
    }

    return res.status(400).json({ error: `Unknown action: ${action}` });
  } catch (err) {
    console.error('[ahnajak-khqr] error', err);
    return res.status(500).json({ error: err?.message || 'Internal error' });
  }
});

module.exports = router;