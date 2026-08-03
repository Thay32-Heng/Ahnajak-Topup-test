/**
 * routes/process-topup.cjs — Order creation + G2Bulk fulfillment
 * Ports the Supabase edge function `process-topup` (~1000 lines) to Express + MySQL.
 *
 * POST /api/process-topup  body: { action?, orderId?, ... }
 *   - No action          → create order (validates package price authoritatively)
 *   - action: 'fulfill'  → fulfill order via G2Bulk (called after payment)
 *   - action: 'check_status' → query G2Bulk order status
 */
const express = require('express');
const { query, queryOne, uuid } = require('../db.cjs');
const { requireAuth, optionalAuth, hasRole } = require('../auth.cjs');
const { sendError } = require('../helpers/errors.cjs');

const router = express.Router();
const G2BULK_API_URL = 'https://api.g2bulk.com/v1';

// ── Telegram notification ──────────────────────────────────────────────────
async function sendTelegramNotification(message, isError = false) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!botToken || !chatId) return;
  try {
    const emoji = isError ? '❌' : '✅';
    await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: `${emoji} ${message}`, parse_mode: 'HTML' }),
    });
  } catch (e) { console.error('[Telegram] Error:', e.message); }
}

// ── Determine product type (card vs recharge) ──────────────────────────────
async function getProductType(productId) {
  const row = await queryOne(
    'SELECT product_type FROM g2bulk_products WHERE g2bulk_product_id = ?', [productId]
  );
  return row?.product_type === 'card' ? 'card' : 'recharge';
}

// ── Resolve authoritative package price (price-tampering prevention) ────────
async function resolveAuthoritativePackage(input) {
  const { gameName, packageName, g2bulkProductId, isPreorder } = input;
  const tables = isPreorder ? ['preorder_packages'] : ['packages', 'special_packages'];
  const allMatches = [];

  for (const table of tables) {
    let sql = `SELECT p.id, p.name, p.price, p.g2bulk_product_id, g.name AS game_name
               FROM ${table} p JOIN games g ON g.id = p.game_id
               WHERE p.name = ? AND g.name = ?`;
    const params = [packageName, gameName];
    if (g2bulkProductId) {
      sql += ' AND p.g2bulk_product_id = ?';
      params.push(g2bulkProductId);
    }
    const [rows] = await query(sql, params);
    for (const row of rows) {
      allMatches.push({
        table, id: row.id, gameName: row.game_name, packageName: row.name,
        price: parseFloat(row.price), g2bulkProductId: row.g2bulk_product_id,
      });
    }
  }

  if (allMatches.length === 0) return null;
  if (allMatches.length === 1) return allMatches[0];

  // Try exact product match first
  if (g2bulkProductId) {
    const exact = allMatches.find(m => m.g2bulkProductId === g2bulkProductId);
    if (exact) return exact;
  }

  // Try price match
  const requestedAmount = Number(input.requestedAmount);
  if (Number.isFinite(requestedAmount)) {
    const priceMatch = allMatches.find(m => Math.abs(m.price - requestedAmount) < 0.0001);
    if (priceMatch) return priceMatch;
  }

  // If all equivalent, return first
  const first = allMatches[0];
  const allEquiv = allMatches.every(m =>
    Math.abs(m.price - first.price) < 0.0001 &&
    (m.g2bulkProductId || null) === (first.g2bulkProductId || null)
  );
  return allEquiv ? first : null;
}

// ── Fulfill card order (immediate delivery of codes) ───────────────────────
async function fulfillCardOrder(orderId, quantity, order, apiKey, tableName) {
  const productId = order.g2bulk_product_id.replace('card_', '');
  const allDeliveryItems = [];
  const allOrderIds = [];
  let lastError = '';

  for (let i = 0; i < quantity; i++) {
    const response = await fetch(`${G2BULK_API_URL}/products/${productId}/purchase`, {
      method: 'POST',
      headers: { 'Accept': 'application/json', 'Content-Type': 'application/json', 'X-API-Key': apiKey },
      body: JSON.stringify({ quantity: 1 }),
    });
    const result = await response.json();
    if (result.success) {
      allOrderIds.push(String(result.order_id || result.transaction_id));
      const rawItems = result.delivery_items || result.card_codes || result.codes || [];
      const items = Array.isArray(rawItems)
        ? rawItems
        : (typeof rawItems === 'string' && rawItems.trim()
          ? rawItems.split(',').map(s => s.trim())
          : []);
      // Normalize delivery items (G2Bulk may return plain strings or objects)
      const mapped = items
        .map(item => {
          if (item && typeof item === 'object') {
            const code = String(item.code ?? item.serial ?? item.id ?? '').trim();
            return { code, serial: String(item.serial ?? item.serial_number ?? '').trim(), expire: String(item.expire ?? item.expiry ?? '').trim() };
          }
          return { code: String(item).trim(), serial: '', expire: '' };
        })
        .filter(it => it.code);
      allDeliveryItems.push(...mapped);
    } else {
      lastError = result.message || result.detail?.message || 'Card purchase failed';
    }
  }

  if (allOrderIds.length > 0) {
    const g2bulkOrderIdStr = allOrderIds.join(',');
    // MONEY-LOSS GUARD: if G2Bulk confirmed the order but returned no codes,
    // never mark completed — flag for manual review so codes can be recovered.
    const hasAllCodes = allDeliveryItems.length >= quantity;
    let status = (hasAllCodes && allOrderIds.length === quantity) ? 'completed' : 'partial';
    let statusMessage = `G2Bulk Card Order: ${g2bulkOrderIdStr}. ${allDeliveryItems.length} code(s) delivered (${allOrderIds.length}/${quantity} succeeded).`;
    if (allDeliveryItems.length === 0) {
      status = 'pending_manual';
      statusMessage = `G2Bulk order ${g2bulkOrderIdStr} confirmed but returned NO codes. Manual recovery required.`;
    }
    await query(`UPDATE ${tableName} SET g2bulk_order_id = ?, status = ?, status_message = ?, card_codes = ? WHERE id = ?`,
      [g2bulkOrderIdStr, status, statusMessage, JSON.stringify(allDeliveryItems), orderId]);
    await sendTelegramNotification(`<b>Card Order ${status === 'completed' ? 'Completed' : status === 'pending_manual' ? '⚠️ MANUAL REVIEW NEEDED' : 'Partial'}</b>\n🎮 ${order.game_name}\n📦 ${order.package_name} (×${quantity})\n👤 ${order.player_id}\n💰 $${order.amount}\n🔢 ${orderId}\n📋 ${g2bulkOrderIdStr}\n🎫 ${allDeliveryItems.length} codes`, status !== 'completed');
    return { success: true, g2bulk_order_id: g2bulkOrderIdStr, status, cards: allDeliveryItems };
  } else {
    await query(`UPDATE ${tableName} SET status = ?, status_message = ? WHERE id = ?`, ['failed', `G2Bulk Card Error: ${lastError}`, orderId]);
    await sendTelegramNotification(`<b>Card Order Failed</b>\n🎮 ${order.game_name}\n📦 ${order.package_name} (×${quantity})\n👤 ${order.player_id}\n💰 $${order.amount}\n🔢 ${orderId}\n⚠️ ${lastError}`, true);
    return { success: false, error: lastError };
  }
}

// ── Fulfill recharge order ─────────────────────────────────────────────────
async function fulfillRechargeOrder(orderId, order, apiKey, quantity, tableName) {
  let gameCode = '';
  let catalogueName = '';

  // PRIORITY 1: g2bulk_products table
  const g2bulkProduct = await queryOne(
    'SELECT fields, product_name FROM g2bulk_products WHERE g2bulk_product_id = ?', [order.g2bulk_product_id]
  );
  if (g2bulkProduct) {
    let fields = g2bulkProduct.fields;
    if (typeof fields === 'string') { try { fields = JSON.parse(fields); } catch {} }
    if (fields?.game_code) gameCode = fields.game_code;
    if (g2bulkProduct.product_name) catalogueName = g2bulkProduct.product_name;
  }

  // PRIORITY 2: Extract from g2bulk_product_id format: game_CODE_id or CODE_id
  let catalogueId = '';
  if (order.g2bulk_product_id) {
    const parts = order.g2bulk_product_id.split('_');
    if (order.g2bulk_product_id.startsWith('game_') && parts.length >= 3) {
      catalogueId = parts[parts.length - 1];
      if (!gameCode) gameCode = parts.slice(1, -1).join('_');
    } else if (parts.length >= 2) {
      // Fallback: CODE_id (no game_ prefix)
      catalogueId = parts[parts.length - 1];
      if (!gameCode) gameCode = parts.slice(0, -1).join('_');
    }
  }

  // PRIORITY 3: packages + games table
  if (!gameCode) {
    const pkg = await queryOne(
      `SELECT p.g2bulk_type_id, g.g2bulk_category_id FROM packages p
       JOIN games g ON g.id = p.game_id WHERE p.g2bulk_product_id = ?`, [order.g2bulk_product_id]
    );
    if (pkg) {
      if (!gameCode && pkg.g2bulk_category_id) gameCode = pkg.g2bulk_category_id;
      if (!catalogueId && pkg.g2bulk_type_id) catalogueId = pkg.g2bulk_type_id;
    }
  }

  // PRIORITY 4: Fetch catalogue name from G2Bulk API
  if (gameCode && catalogueId && !catalogueName) {
    try {
      const catRes = await fetch(`${G2BULK_API_URL}/games/${gameCode}/catalogue`, {
        headers: { 'Accept': 'application/json', 'X-API-Key': apiKey },
      });
      const catData = await catRes.json();
      if (catData.success && Array.isArray(catData.catalogues)) {
        const matched = catData.catalogues.find(c => String(c.id) === catalogueId);
        if (matched) {
          catalogueName = matched.name;
          // Sync to g2bulk_products
          try {
            await query(
              `INSERT INTO g2bulk_products (id, g2bulk_type_id, g2bulk_product_id, game_name, product_name, denomination, price, currency, fields, is_active, product_type)
               VALUES (UUID(), ?, ?, ?, ?, ?, ?, 'USD', ?, 1, 'recharge')
               ON DUPLICATE KEY UPDATE product_name = VALUES(product_name), fields = VALUES(fields)`,
              [catalogueId, order.g2bulk_product_id, order.game_name || gameCode, catalogueName, catalogueName, parseFloat(matched.amount) || 0, JSON.stringify({ game_code: gameCode })]
            );
          } catch {}
        }
      }
    } catch (e) { console.error('Catalogue fetch error:', e.message); }
  }

  if (!gameCode) {
    await query(`UPDATE ${tableName} SET status = ?, status_message = ? WHERE id = ?`, ['failed', `Could not determine game_code for product: ${order.g2bulk_product_id}`, orderId]);
    return { success: false, error: 'Could not determine game_code' };
  }
  if (!catalogueName) {
    await query(`UPDATE ${tableName} SET status = ?, status_message = ? WHERE id = ?`, ['failed', `Could not determine catalogue_name for product: ${order.g2bulk_product_id}`, orderId]);
    return { success: false, error: 'Could not determine catalogue_name' };
  }

  const callbackUrl = `${process.env.PUBLIC_BASE_URL || 'http://localhost:9911'}/api/g2bulk-webhook`;
  const allOrderIds = [];
  let failedCount = 0;
  let lastError = '';
  let lastStatus = '';

  for (let i = 0; i < quantity; i++) {
    const orderBody = {
      catalogue_name: catalogueName,
      player_id: order.player_id,
      remark: `order_id:${orderId}_${i + 1}of${quantity}`,
      callback_url: callbackUrl,
    };
    if (order.server_id) orderBody.server_id = order.server_id;

    const response = await fetch(`${G2BULK_API_URL}/games/${gameCode}/order`, {
      method: 'POST',
      headers: { 'Accept': 'application/json', 'Content-Type': 'application/json', 'X-API-Key': apiKey },
      body: JSON.stringify(orderBody),
    });
    const result = await response.json();
    if (result.success && result.order) {
      allOrderIds.push(String(result.order.order_id));
      lastStatus = result.order.status;
    } else {
      failedCount++;
      lastError = result.message || result.detail?.message || JSON.stringify(result);
    }
  }

  if (allOrderIds.length > 0) {
    const g2bulkOrderIdStr = allOrderIds.join(',');
    let finalStatus = 'processing';
    let statusMessage = `G2Bulk Orders: ${g2bulkOrderIdStr}. ${allOrderIds.length}/${quantity} sent.`;
    if (lastStatus === 'COMPLETED' && failedCount === 0) {
      finalStatus = 'completed';
      statusMessage = `Successfully delivered via G2Bulk (×${quantity}). Orders: ${g2bulkOrderIdStr}`;
    } else if (failedCount > 0 && failedCount < quantity) {
      finalStatus = 'partial';
      statusMessage = `Partial delivery: ${allOrderIds.length}/${quantity} succeeded. Orders: ${g2bulkOrderIdStr}`;
    } else if (failedCount === quantity) {
      finalStatus = 'failed';
      statusMessage = `All ${quantity} G2Bulk orders failed. Error: ${lastError}`;
    }

    await query(`UPDATE ${tableName} SET g2bulk_order_id = ?, status = ?, status_message = ? WHERE id = ?`,
      [g2bulkOrderIdStr, finalStatus, statusMessage, orderId]);
    await sendTelegramNotification(`<b>Recharge ${finalStatus}</b>\n🎮 ${order.game_name}\n📦 ${order.package_name} (×${quantity})\n👤 ${order.player_id}${order.server_id ? ` (Server: ${order.server_id})` : ''}\n💰 $${order.amount}\n🔢 ${orderId}\n📋 ${g2bulkOrderIdStr}`, failedCount > 0);
    return { success: true, g2bulk_order_id: g2bulkOrderIdStr, status: finalStatus };
  } else {
    await query(`UPDATE ${tableName} SET status = ?, status_message = ? WHERE id = ?`, ['failed', `G2Bulk Error (×${quantity}): ${lastError}`, orderId]);
    await sendTelegramNotification(`<b>Recharge Failed</b>\n🎮 ${order.game_name}\n📦 ${order.package_name} (×${quantity})\n👤 ${order.player_id}\n💰 $${order.amount}\n⚠️ ${lastError}`, true);
    return { success: false, error: lastError };
  }
}

// ── Fulfill G2Bulk order (main orchestrator) ───────────────────────────────
async function fulfillG2BulkOrder(orderId, tableName = 'topup_orders') {
  const order = await queryOne(`SELECT * FROM ${tableName} WHERE id = ?`, [orderId]);
  if (!order) return { success: false, error: 'Order not found' };

  // Atomic guard: only proceed if status is 'paid'
  if (order.status !== 'paid') {
    return { success: true, status: order.status, message: 'Already processed' };
  }

  // Atomic lock: set to 'processing'
  const lockResult = await query(
    `UPDATE ${tableName} SET status = ?, status_message = ? WHERE id = ? AND status = 'paid'`,
    ['processing', 'Processing order with G2Bulk...', orderId]
  );
  if (lockResult[0].affectedRows === 0) {
    return { success: true, status: 'processing', message: 'Already being processed' };
  }

  let g2bulkProductId = order.g2bulk_product_id;

  // Resolve g2bulk_product_id if missing
  if (!g2bulkProductId) {
    const pkg = await queryOne(
      `SELECT p.g2bulk_product_id FROM packages p JOIN games g ON g.id = p.game_id
       WHERE p.name = ? AND g.name = ?`, [order.package_name, order.game_name]
    );
    if (!pkg) {
      const spkg = await queryOne(
        `SELECT sp.g2bulk_product_id FROM special_packages sp JOIN games g ON g.id = sp.game_id
         WHERE sp.name = ? AND g.name = ?`, [order.package_name, order.game_name]
      );
      if (spkg) g2bulkProductId = spkg.g2bulk_product_id;
    } else {
      g2bulkProductId = pkg.g2bulk_product_id;
    }
    if (g2bulkProductId) {
      await query(`UPDATE ${tableName} SET g2bulk_product_id = ? WHERE id = ?`, [g2bulkProductId, orderId]);
    }
  }

  if (!g2bulkProductId) {
    await query(`UPDATE ${tableName} SET status = ?, status_message = ? WHERE id = ?`,
      ['pending_manual', 'No G2Bulk product linked. Please link a package to a G2Bulk product in admin, then retry.', orderId]);
    return { success: true, status: 'pending_manual' };
  }

  const apiConfig = await queryOne(`SELECT * FROM api_configurations WHERE api_name = 'g2bulk'`);
  if (!apiConfig?.is_enabled || !apiConfig.api_secret) {
    await query(`UPDATE ${tableName} SET status = ?, status_message = ? WHERE id = ?`,
      ['pending_manual', 'G2Bulk API not configured. Manual fulfillment required.', orderId]);
    return { success: true, status: 'pending_manual' };
  }

  const apiKey = apiConfig.api_secret;

  try {
    const productType = await getProductType(g2bulkProductId);

    // Resolve quantity deterministically
    let fulfillQuantity = 1;
    const targetAmount = Number(order.amount ?? 0);

    if (productType === 'card') {
      // Card/VG orders: quantity is stored on the order itself
      const qty = Math.floor(Number(order.quantity));
      if (Number.isInteger(qty) && qty >= 1 && qty <= 50) fulfillQuantity = qty;
    } else {
      for (const table of ['packages', 'special_packages', 'preorder_packages']) {
      const [rows] = await query(
        `SELECT quantity, price, amount FROM ${table}
         WHERE g2bulk_product_id = ? AND name = ?
         ORDER BY updated_at DESC LIMIT 20`,
        [g2bulkProductId, order.package_name]
      );
      if (rows.length === 0) continue;

      const normalized = rows.map(r => {
        const qty = Number(r.quantity);
        const normQty = Number.isFinite(qty) && qty > 0 ? Math.floor(qty) : 1;
        const price = Number.isFinite(Number(r.price)) ? Number(r.price) : null;
        const diff = price !== null ? Math.abs(price - targetAmount) : null;
        return { quantity: normQty, price, diff };
      });

      const exactMatch = normalized.find(r => r.diff !== null && r.diff <= 0.0001);
      if (exactMatch) { fulfillQuantity = exactMatch.quantity; break; }

      const nearest = normalized.filter(r => r.diff !== null).sort((a, b) => a.diff - b.diff)[0];
      if (nearest && nearest.diff <= 0.02) { fulfillQuantity = nearest.quantity; break; }

      const distinct = new Set(normalized.map(r => r.quantity));
      if (distinct.size === 1) { fulfillQuantity = normalized[0].quantity; break; }
      break; // ambiguous → fail-safe qty=1
      }
    }

    await query(`UPDATE ${tableName} SET status_message = ? WHERE id = ?`,
      [`Sending to G2Bulk for fulfillment (×${fulfillQuantity})...`, orderId]);

    const orderForFulfillment = { ...order, g2bulk_product_id: g2bulkProductId };

    if (productType === 'card') {
      return await fulfillCardOrder(orderId, fulfillQuantity, orderForFulfillment, apiKey, tableName);
    } else {
      return await fulfillRechargeOrder(orderId, orderForFulfillment, apiKey, fulfillQuantity, tableName);
    }
  } catch (err) {
    await query(`UPDATE ${tableName} SET status = ?, status_message = ? WHERE id = ?`,
      ['failed', `G2Bulk error: ${err.message}`, orderId]);
    return { success: false, error: err.message };
  }
}

// ── Recovery sweeper (called every 60s from index.cjs) ──────────────────────
// Money-loss protection:
//  - 'paid' orders stuck before fulfillment are retried (atomic lock makes this safe —
//    a crashed attempt leaves status 'processing', so 'paid' means G2Bulk was never called)
//  - due preorders (scheduled time passed) are fulfilled
//  - 'processing' orders stuck 15+ min are NEVER auto-retried (double-charge risk),
//    only flagged + alerted for manual review
async function recoverStuckOrders() {
  try {
    const [paidOrders] = await query(
      `SELECT id FROM topup_orders
       WHERE status = 'paid' AND TIMESTAMPDIFF(MINUTE, updated_at, NOW()) >= 1
       ORDER BY updated_at LIMIT 10`
    );
    for (const row of paidOrders) {
      try { await fulfillG2BulkOrder(row.id); }
      catch (e) { console.error('[sweeper] fulfill failed:', row.id, e.message); }
    }

    const [duePreorders] = await query(
      `SELECT id FROM preorder_orders
       WHERE status = 'paid' AND scheduled_fulfill_at IS NOT NULL AND scheduled_fulfill_at <= NOW()
       ORDER BY scheduled_fulfill_at LIMIT 10`
    );
    for (const row of duePreorders) {
      try { await fulfillG2BulkOrder(row.id, 'preorder_orders'); }
      catch (e) { console.error('[sweeper] preorder fulfill failed:', row.id, e.message); }
    }

    const [stuck] = await query(
      `SELECT id, game_name, package_name, amount, g2bulk_order_id FROM topup_orders
       WHERE status = 'processing' AND TIMESTAMPDIFF(MINUTE, updated_at, NOW()) >= 15
         AND (status_message IS NULL OR status_message NOT LIKE '%manual review%')
       LIMIT 5`
    );
    for (const row of stuck) {
      await query(
        `UPDATE topup_orders SET status_message = CONCAT(IFNULL(status_message, ''), ' — STUCK: manual review required') WHERE id = ?`,
        [row.id]
      );
      await sendTelegramNotification(
        `<b>⏳ STUCK Order Needs Manual Review</b>\n🎮 ${row.game_name}\n📦 ${row.package_name}\n💰 $${row.amount}\n🔢 ${row.id}\n📋 G2Bulk: ${row.g2bulk_order_id || 'none'}\n\nProcessing for 15+ min. Check G2Bulk before retrying to avoid double-charge.`, true);
    }
  } catch (err) {
    console.error('[sweeper] error:', err.message);
  }
}

// ── Check G2Bulk order status ──────────────────────────────────────────────
async function checkG2BulkOrderStatus(orderId) {
  const order = await queryOne(`SELECT * FROM topup_orders WHERE id = ?`, [orderId]);
  if (!order?.g2bulk_order_id) return { success: false, error: 'No G2Bulk order ID found' };

  const apiConfig = await queryOne(`SELECT * FROM api_configurations WHERE api_name = 'g2bulk'`);
  if (!apiConfig?.is_enabled || !apiConfig.api_secret) return { success: false, error: 'G2Bulk not configured' };

  let gameCode = '';
  const g2bulkProduct = await queryOne(`SELECT fields FROM g2bulk_products WHERE g2bulk_product_id = ?`, [order.g2bulk_product_id]);
  let fields = g2bulkProduct?.fields;
  if (typeof fields === 'string') { try { fields = JSON.parse(fields); } catch {} }
  if (fields?.game_code) gameCode = fields.game_code;
  else if (order.g2bulk_product_id?.startsWith('game_')) {
    const parts = order.g2bulk_product_id.split('_');
    if (parts.length >= 3) gameCode = parts.slice(1, -1).join('_');
  }
  if (!gameCode) return { success: false, error: 'Could not determine game code' };

  const response = await fetch(`${G2BULK_API_URL}/games/order/status`, {
    method: 'POST',
    headers: { 'Accept': 'application/json', 'Content-Type': 'application/json', 'X-API-Key': apiConfig.api_secret },
    body: JSON.stringify({ order_id: parseInt(order.g2bulk_order_id), game: gameCode }),
  });
  const result = await response.json();

  if (result.success && result.order) {
    const g2bulkStatus = result.order.status;
    let finalStatus = order.status;
    if (g2bulkStatus === 'COMPLETED') finalStatus = 'completed';
    else if (g2bulkStatus === 'FAILED') finalStatus = 'failed';
    await query(`UPDATE topup_orders SET status = ?, status_message = ? WHERE id = ?`,
      [finalStatus, `G2Bulk Status: ${g2bulkStatus}`, orderId]);
    return { success: true, g2bulk_status: g2bulkStatus, our_status: finalStatus };
  }
  return { success: false, error: result.message || 'Failed to check status' };
}

// ── Routes ─────────────────────────────────────────────────────────────────
router.post('/', optionalAuth, async (req, res) => {
  const body = req.body;

  try {
    // Action: fulfill (requires auth + ownership or admin)
    if (body.action === 'fulfill' && body.orderId) {
      if (!req.user) return res.status(401).json({ success: false, error: 'Authentication required' });
      const isPreorder = body.isPreorder === true;
      const tableName = isPreorder ? 'preorder_orders' : 'topup_orders';
      const order = await queryOne(`SELECT user_id FROM ${tableName} WHERE id = ?`, [body.orderId]);
      if (!order) return res.status(404).json({ success: false, error: 'Order not found' });

      const isAdmin = await hasRole(req.user.id, 'admin');
      const isOwner = order.user_id === req.user.id;
      if (!isOwner && !isAdmin) {
        return res.status(403).json({ success: false, error: 'Access denied' });
      }

      if (isPreorder) {
        const preorder = await queryOne(`SELECT scheduled_fulfill_at, status FROM preorder_orders WHERE id = ?`, [body.orderId]);
        if (preorder?.scheduled_fulfill_at) {
          const scheduledTime = new Date(preorder.scheduled_fulfill_at).getTime();
          if (scheduledTime > Date.now()) {
            return res.json({ success: true, status: 'scheduled', message: `Pre-order scheduled for fulfillment at ${preorder.scheduled_fulfill_at}` });
          }
        }
      }

      if (body.force === true) {
        // Manual retry forces status to 'paid' — this must never be usable by an order
        // owner (client), otherwise an unpaid 'pending' order could be fulfilled for free.
        if (!isAdmin) {
          return res.json({ success: false, error: 'Manual retry requires admin access' });
        }
        const current = await queryOne(`SELECT status, g2bulk_order_id FROM ${tableName} WHERE id = ?`, [body.orderId]);
        if (!current) return res.status(404).json({ success: false, error: 'Order not found' });
        if (current.status === 'pending_manual') {
          return res.json({
            success: false,
            error: 'Manual review required — G2Bulk may already have this order (no codes returned). Check the G2Bulk order before retrying to avoid a double charge. If G2Bulk has no order, change status to failed and retry.',
          });
        }
        if (current.status === 'failed' || current.status === 'pending' || current.status === 'paid') {
          const flip = await query(
            `UPDATE ${tableName} SET status = 'paid', status_message = 'Manual retry: re-sending to G2Bulk' WHERE id = ? AND status IN ('failed','pending','paid')`,
            [body.orderId]
          );
          if (flip?.[0]?.affectedRows === 0) {
            return res.json({ success: false, error: 'Order cannot be retried from its current status' });
          }
        } else {
          return res.json({ success: false, error: `Order cannot be retried from status "${current.status}"` });
        }
      }

      const result = await fulfillG2BulkOrder(body.orderId, tableName);
      return res.json(result);
    }

    // Action: check_status (requires auth)
    if (body.action === 'check_status' && body.orderId) {
      if (!req.user) return res.status(401).json({ success: false, error: 'Authentication required' });
      const order = await queryOne('SELECT user_id FROM topup_orders WHERE id = ?', [body.orderId]);
      if (!order) return res.status(404).json({ success: false, error: 'Order not found' });

      const isAdmin = await hasRole(req.user.id, 'admin');
      const isOwner = order.user_id === req.user.id;
      if (!isOwner && !isAdmin) {
        return res.status(403).json({ success: false, error: 'Access denied' });
      }
      const result = await checkG2BulkOrderStatus(body.orderId);
      return res.json(result);
    }

    // Create order (default action)
    const { game_name, package_name, player_id, server_id, player_name, amount, currency, payment_method, g2bulk_product_id, is_preorder, scheduled_fulfill_at } = body;

    // Voucher/Gift Card orders have no player_id — detect card products
    const isCardProduct = !!g2bulk_product_id && String(g2bulk_product_id).startsWith('card_');

    // Voucher/Gift Card orders require login (server-enforced, not just UI)
    if (isCardProduct && !req.user) {
      return res.status(401).json({ success: false, error: 'Login required to order vouchers or gift cards' });
    }
    const quantity = isCardProduct ? Math.floor(Number(body.quantity) || 1) : 1;
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 50) {
      return res.status(400).json({ success: false, error: 'Quantity must be between 1 and 50' });
    }

    if (!game_name || !package_name) {
      return res.status(400).json({ success: false, error: 'game_name, package_name, and player_id are required' });
    }
    if (!isCardProduct && !player_id) {
      return res.status(400).json({ success: false, error: 'game_name, package_name, and player_id are required' });
    }
    if (player_id && String(player_id).length > 100) {
      return res.status(400).json({ success: false, error: 'player_id too long' });
    }


    let authoritativePackage = null;
    if (isCardProduct) {
      // Card/VG products: validate price authoritatively against g2bulk_products table
      const gp = await queryOne(
        'SELECT product_name, price, is_active FROM g2bulk_products WHERE g2bulk_product_id = ?',
        [g2bulk_product_id]
      );
      if (!gp || gp.is_active !== 1) {
        return res.status(400).json({ success: false, error: 'Invalid card product selection' });
      }
      authoritativePackage = {
        id: null, name: gp.product_name, price: parseFloat(gp.price),
        g2bulkProductId: g2bulk_product_id,
      };
    } else {
      authoritativePackage = await resolveAuthoritativePackage({
        gameName: game_name, packageName: package_name,
        g2bulkProductId: g2bulk_product_id, isPreorder: is_preorder === true,
        requestedAmount: Number(amount),
      });
    }

    if (!authoritativePackage) {
      return res.status(400).json({ success: false, error: 'Invalid package selection' });
    }

    const authoritativeAmount = Math.round(Number(authoritativePackage.price) * quantity * 100) / 100;
    const payloadAmount = Number(amount);
    if (Number.isFinite(payloadAmount) && Math.abs(payloadAmount - authoritativeAmount) > 0.0001) {
      return res.status(400).json({ success: false, error: 'Amount does not match selected package price' });
    }

    const tableName = is_preorder ? 'preorder_orders' : 'topup_orders';
    const defaultStatus = is_preorder ? 'notpaid' : 'pending';
    const orderId = uuid();

    if (is_preorder && scheduled_fulfill_at) {
      await query(
        `INSERT INTO ${tableName} (id, user_id, game_name, package_name, player_id, server_id, player_name, amount, currency, payment_method, g2bulk_product_id, status, scheduled_fulfill_at, quantity)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [orderId, req.user?.id || null, game_name, package_name, player_id || '', server_id || null, player_name || null, authoritativeAmount, currency || 'USD', payment_method || null, authoritativePackage.g2bulkProductId || null, defaultStatus, scheduled_fulfill_at, quantity]
      );
    } else {
      await query(
        `INSERT INTO ${tableName} (id, user_id, game_name, package_name, player_id, server_id, player_name, amount, currency, payment_method, g2bulk_product_id, status, quantity)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [orderId, req.user?.id || null, game_name, package_name, player_id || '', server_id || null, player_name || null, authoritativeAmount, currency || 'USD', payment_method || null, authoritativePackage.g2bulkProductId || null, defaultStatus, quantity]
      );
    }

    return res.json({
      success: true, order_id: orderId, status: defaultStatus,
      has_g2bulk: !!g2bulk_product_id, is_preorder: !!is_preorder,
      message: is_preorder ? 'Pre-order created. Awaiting payment confirmation.' : 'Order created. Awaiting payment confirmation.',
    });
  } catch (err) { sendError(res, err, 'POST /process-topup'); }
});

// Export the fulfill function for use by webhook routes
module.exports = router;
module.exports.fulfillOrder = (orderId, isPreorder = false) =>
  fulfillG2BulkOrder(orderId, isPreorder ? 'preorder_orders' : 'topup_orders');
module.exports.checkStatus = checkG2BulkOrderStatus;
module.exports.recoverStuckOrders = recoverStuckOrders;
