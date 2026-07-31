/**
 * routes/vg-products.cjs — Voucher & Gift Card products
 * GET  /api/products/vg            — public: list voucher & gift card products
 * GET  /api/products/vg/categories — admin: list G2Bulk categories (searchable)
 * POST /api/products/vg/import     — admin: import products from G2Bulk (all / by ids / by category)
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
        image: fields.image_url || null,
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

// Admin: list G2Bulk categories (with imported counts), searchable by title
router.get('/categories', requireAdmin, async (req, res) => {
  const q = String(req.query.q || '').trim().toLowerCase();
  try {
    const cfg = await queryOne("SELECT * FROM api_configurations WHERE api_name = 'g2bulk' AND is_enabled = 1");
    if (!cfg?.api_secret) return res.status(400).json({ error: 'G2Bulk not configured' });

    const headers = { 'Accept': 'application/json', 'Content-Type': 'application/json', 'X-API-Key': cfg.api_secret };
    const catRes = await fetch(`${G2BULK_API_URL}/category`, { headers });
    const catData = await catRes.json();

    // Count already-imported products per category
    const [rows] = await query(
      "SELECT fields FROM g2bulk_products WHERE product_type = 'card'"
    );
    const importedByCategory = {};
    for (const r of rows) {
      const title = parseFields(r.fields).category_title;
      if (title) importedByCategory[title] = (importedByCategory[title] || 0) + 1;
    }

    let categories = Array.isArray(catData.categories)
      ? catData.categories.map(c => ({
          id: c.id,
          title: c.title || `Category ${c.id}`,
          description: c.description || null,
          image_url: c.image_url || null,
          product_count: c.product_count || 0,
          imported_count: importedByCategory[c.title] || 0,
        }))
      : [];

    if (q) {
      categories = categories.filter(c => c.title.toLowerCase().includes(q));
    }

    return res.json({ categories });
  } catch (err) {
    console.error('[vg-products] Categories error:', err);
    return res.status(500).json({ error: err.message });
  }
});

// Admin: import voucher/gift card products from G2Bulk
// body: { product_type: 'voucher'|'gift_card', categoryId?: number|string, productIds?: string[] }
//   categoryId — import every product inside that G2Bulk category
//   productIds  — import only the listed products
//   (neither → import everything from /products)
router.post('/import', requireAdmin, async (req, res) => {
  const { product_type } = req.body; // 'voucher' | 'gift_card'
  if (!product_type || !['voucher', 'gift_card'].includes(product_type)) {
    return res.status(400).json({ error: 'product_type must be "voucher" or "gift_card"' });
  }
  const categoryId = req.body.categoryId !== undefined ? String(req.body.categoryId) : null;
  const onlyIds = Array.isArray(req.body.productIds) ? new Set(req.body.productIds.map(String)) : null;

  try {
    const cfg = await queryOne("SELECT * FROM api_configurations WHERE api_name = 'g2bulk' AND is_enabled = 1");
    if (!cfg?.api_secret) return res.status(400).json({ error: 'G2Bulk not configured' });

    const headers = { 'Accept': 'application/json', 'Content-Type': 'application/json', 'X-API-Key': cfg.api_secret };
    const url = categoryId ? `${G2BULK_API_URL}/category/${categoryId}` : `${G2BULK_API_URL}/products`;
    const prodRes = await fetch(url, { headers });
    const prodData = await prodRes.json();

    if (!prodData.products || !Array.isArray(prodData.products)) {
      return res.json({ success: true, imported: 0, message: 'No products found from G2Bulk' });
    }

    let imported = 0;
    for (const prod of prodData.products) {
      if (onlyIds && !onlyIds.has(String(prod.id))) continue;
      // G2Bulk products return: { id, title, description, category_id, category_title, unit_price, image_url, stock }
      const pName = prod.title || prod.name || `Card ${prod.id}`;
      const amount = parseFloat(prod.unit_price ?? prod.amount) || 0;
      const fields = { category: product_type, category_title: prod.category_title || null, stock: prod.stock ?? null, image_url: prod.image_url || null };
      await query(
        `INSERT INTO g2bulk_products (id, g2bulk_type_id, g2bulk_product_id, game_name, product_name, denomination, price, currency, fields, is_active, product_type)
         VALUES (UUID(), '', ?, ?, ?, ?, 'USD', ?, 1, 'card')
         ON DUPLICATE KEY UPDATE game_name = VALUES(game_name), product_name = VALUES(product_name), denomination = VALUES(denomination), price = VALUES(price), fields = VALUES(fields), is_active = 1, product_type = 'card'`,
        [`card_${prod.id}`, pName, pName, amount, JSON.stringify(fields)]
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
