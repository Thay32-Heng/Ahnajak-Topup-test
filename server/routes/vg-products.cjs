/**
 * routes/vg-products.cjs — Voucher & Gift Card products
 * GET  /api/products/vg            — public: list voucher & gift card products
 * GET  /api/products/vg/search     — admin: search G2Bulk products (for easy adding)
 * POST /api/products/vg/import     — admin: import voucher/gift card products from G2Bulk
 */
const express = require('express');
const { query, queryOne } = require('../db.cjs');
const { requireAdmin } = require('../auth.cjs');

const router = express.Router();

const G2BULK_API_URL = 'https://api.g2bulk.com/v1';

function parseFields(fields) {
  if (!fields) return {};
  if (typeof fields === 'string') {
    try { return JSON.parse(fields); } catch { return {}; }
  }
  return fields || {};
}

// Public: list active voucher & gift card products
router.get('/', async (req, res) => {
  try {
    const [rows] = await query(
      `SELECT id, g2bulk_product_id, g2bulk_type_id, product_name AS name, denomination AS description,
              price, currency, fields, product_type, is_active
       FROM g2bulk_products
       WHERE product_type IN ('card') AND is_active = 1 AND price > 0
       ORDER BY product_type, price ASC`
    );
    const products = rows.map(r => {
      const fields = parseFields(r.fields);
      return {
        id: r.id,
        name: r.name,
        description: r.description || null,
        price: parseFloat(r.price) || 0,
        currency: r.currency || 'USD',
        product_type: fields.category === 'voucher' ? 'voucher' : 'gift_card',
        g2bulk_product_id: r.g2bulk_product_id,
        g2bulk_type_id: r.g2bulk_type_id,
        fields,
      };
    });
    return res.json(products);
  } catch (err) {
    console.error('[vg-products] Error fetching products:', err);
    return res.status(500).json({ error: 'Failed to fetch products' });
  }
});

// Admin: search G2Bulk products to add (like the game search in imports)
router.get('/search', requireAdmin, async (req, res) => {
  const q = String(req.query.q || '').trim().toLowerCase();
  try {
    const cfg = await queryOne("SELECT * FROM api_configurations WHERE api_name = 'g2bulk' AND is_enabled = 1");
    if (!cfg?.api_secret) return res.status(400).json({ error: 'G2Bulk not configured' });

    const headers = { 'Accept': 'application/json', 'Content-Type': 'application/json', 'X-API-Key': cfg.api_secret };
    const prodRes = await fetch(`${G2BULK_API_URL}/products`, { headers });
    const prodData = await prodRes.json();
    if (!prodData.products || !Array.isArray(prodData.products)) {
      return res.json({ products: [] });
    }

    let list = prodData.products;
    if (q) {
      list = list.filter(p => {
        const name = String(p.name || '').toLowerCase();
        const id = String(p.id || '').toLowerCase();
        const amount = String(p.amount || '');
        return name.includes(q) || id.includes(q) || amount.includes(q);
      });
    }

    // Flag products already imported (and their category)
    const [rows] = await query(
      "SELECT g2bulk_product_id, fields FROM g2bulk_products WHERE product_type = 'card'"
    );
    const importedMap = {};
    for (const r of rows) {
      importedMap[r.g2bulk_product_id] = parseFields(r.fields).category === 'voucher' ? 'voucher' : 'gift_card';
    }

    const products = list.slice(0, 200).map(p => {
      const pid = `card_${p.id}`;
      return {
        id: p.id,
        name: p.name || `Card ${p.id}`,
        amount: parseFloat(p.amount) || 0,
        imported: !!importedMap[pid],
        category: importedMap[pid] || null,
      };
    });
    return res.json({ products, total: list.length });
  } catch (err) {
    console.error('[vg-products] Search error:', err);
    return res.status(500).json({ error: err.message });
  }
});

// Admin: import voucher/gift card products from G2Bulk
// body: { product_type: 'voucher'|'gift_card', productIds?: string[] } — productIds limits the import
router.post('/import', requireAdmin, async (req, res) => {
  const { product_type } = req.body; // 'voucher' | 'gift_card'
  if (!product_type || !['voucher', 'gift_card'].includes(product_type)) {
    return res.status(400).json({ error: 'product_type must be "voucher" or "gift_card"' });
  }
  const onlyIds = Array.isArray(req.body.productIds) ? new Set(req.body.productIds.map(String)) : null;

  try {
    const cfg = await queryOne("SELECT * FROM api_configurations WHERE api_name = 'g2bulk' AND is_enabled = 1");
    if (!cfg?.api_secret) return res.status(400).json({ error: 'G2Bulk not configured' });

    const headers = { 'Accept': 'application/json', 'Content-Type': 'application/json', 'X-API-Key': cfg.api_secret };
    const prodRes = await fetch(`${G2BULK_API_URL}/products`, { headers });
    const prodData = await prodRes.json();

    if (!prodData.products || !Array.isArray(prodData.products)) {
      return res.json({ success: true, imported: 0, message: 'No products found from G2Bulk' });
    }

    let imported = 0;
    for (const prod of prodData.products) {
      if (onlyIds && !onlyIds.has(String(prod.id))) continue;
      const pName = prod.name || `Card ${prod.id}`;
      const amount = parseFloat(prod.amount) || 0;
      await query(
        `INSERT INTO g2bulk_products (id, g2bulk_type_id, g2bulk_product_id, game_name, product_name, denomination, price, currency, fields, is_active, product_type)
         VALUES (UUID(), '', ?, ?, ?, ?, 'USD', ?, 1, 'card')
         ON DUPLICATE KEY UPDATE game_name = VALUES(game_name), product_name = VALUES(product_name), denomination = VALUES(denomination), price = VALUES(price), fields = VALUES(fields), is_active = 1, product_type = 'card'`,
        [`card_${prod.id}`, pName, pName, amount, JSON.stringify({ category: product_type })]
      );
      imported++;
    }

    return res.json({ success: true, imported });
  } catch (err) {
    console.error('[vg-products] Import error:', err);
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
