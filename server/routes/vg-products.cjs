/**
 * routes/vg-products.cjs — Voucher & Gift Card products
 * GET  /api/products/vg            — public: list voucher & gift card products
 * GET  /api/products/vg/categories — admin: list G2Bulk categories (searchable)
 * POST /api/products/vg/import     — admin: import products from G2Bulk (all / by ids / by category)
 */
const express = require('express');
const rateLimit = require('express-rate-limit');
const { query, queryOne } = require('../db.cjs');
const { requireAdmin } = require('../auth.cjs');

const router = express.Router();

// Admin price polling hits G2Bulk's paid API — cap requests
const livePriceLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  message: { error: 'Too many requests — please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});

const G2BULK_API_URL = 'https://api.g2bulk.com/v1';

function parseFields(fields) {
  if (!fields) return {};
  if (typeof fields === 'string') {
    try { return JSON.parse(fields); } catch { return {}; }
  }
  return fields || {};
}

function slugify(s) {
  return String(s || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'category';
}

function parseTags(raw) {
  try { return Array.isArray(JSON.parse(raw || '[]')) ? JSON.parse(raw) : []; } catch { return []; }
}

/**
 * Upsert a `games` row for a G2Bulk category so it can be styled/renamed
 * in the admin Games tab (icon, name, slug). Tagged `["vg"]` so customer
 * game lists (Index) can hide it. Never renames or re-slugs an existing game.
 */
async function upsertCategoryGame(categoryId, title, imageUrl) {
  const cid = String(categoryId);
  const existing = await queryOne('SELECT id, tags FROM games WHERE g2bulk_category_id = ?', [cid]);
  if (existing) {
    const tags = parseTags(existing.tags);
    if (!tags.includes('vg')) tags.push('vg');
    await query(
      'UPDATE games SET g2bulk_category_id = ?, image = COALESCE(?, image), tags = ? WHERE id = ?',
      [cid, imageUrl || null, JSON.stringify(tags), existing.id]
    );
    return false;
  }
  let slug = slugify(title);
  const [dup] = await query('SELECT id FROM games WHERE slug = ?', [slug]);
  if (dup.length > 0) slug = `${slug}-${cid}`;
  await query(
    `INSERT INTO games (id, name, slug, image, description, sort_order, g2bulk_category_id, tags)
     VALUES (UUID(), ?, ?, ?, NULL, 999, ?, ?)`,
    [title, slug, imageUrl || null, cid, JSON.stringify(['vg'])]
  );
  return true;
}

function mapProductRow(r) {
  const fields = parseFields(r.fields);
  return {
    id: r.id,
    name: r.name,
    description: r.description || null,
    price: parseFloat(r.price) || 0,
    currency: r.currency || 'USD',
    product_type: fields.category === 'voucher' ? 'voucher' : 'gift_card',
    image: fields.image_url || null,
    category_id: fields.category_id || null,
    category_title: fields.category_title || null,
    g2bulk_product_id: r.g2bulk_product_id,
    g2bulk_type_id: r.g2bulk_type_id,
    fields,
  };
}

async function getVgMarkupPercent() {
  try {
    const [rows] = await query("SELECT value FROM site_settings WHERE `key` = 'vg_markup_percent'");
    if (!rows.length) return 0;
    const parsed = JSON.parse(rows[0].value);
    const n = parseFloat(parsed);
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch { return 0; }
}

function applyMarkup(unitPrice, markupPercent) {
  return Math.round(unitPrice * (1 + markupPercent / 100) * 100) / 100;
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
    const products = rows.map(r => mapProductRow(r));
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

    // Count already-imported products per category (visible ones only —
    // hidden products count as "not imported" so they can be re-imported)
    const [rows] = await query(
      "SELECT fields, is_active FROM g2bulk_products WHERE product_type = 'card'"
    );
    const importedByCategory = {};
    const hiddenByCategory = {};
    for (const r of rows) {
      const title = parseFields(r.fields).category_title;
      if (!title) continue;
      if (!r.is_active) {
        hiddenByCategory[title] = (hiddenByCategory[title] || 0) + 1;
      } else {
        importedByCategory[title] = (importedByCategory[title] || 0) + 1;
      }
    }

    let categories = Array.isArray(catData.categories)
      ? catData.categories.map(c => ({
          id: c.id,
          title: c.title || `Category ${c.id}`,
          description: c.description || null,
          image_url: c.image_url || null,
          product_count: c.product_count || 0,
          imported_count: importedByCategory[c.title] || 0,
          hidden_count: hiddenByCategory[c.title] || 0,
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

// Admin: delete an imported VG category (its shop game) + every product inside it
router.delete('/categories/:id', requireAdmin, async (req, res) => {
  try {
    const game = await queryOne(
      'SELECT id, name, g2bulk_category_id FROM games WHERE id = ? AND g2bulk_category_id IS NOT NULL',
      [req.params.id]
    );
    if (!game) return res.status(404).json({ error: 'Category not found' });

    const [products] = await query(
      `SELECT id, g2bulk_product_id FROM g2bulk_products
       WHERE product_type = 'card'
         AND (JSON_UNQUOTE(JSON_EXTRACT(fields, '$.category_id')) = ?
              OR JSON_UNQUOTE(JSON_EXTRACT(fields, '$.category_title')) = ?)`,
      [String(game.g2bulk_category_id), game.name]
    );

    let productsDeleted = 0;
    for (const p of products) {
      const del = await query('DELETE FROM g2bulk_products WHERE id = ?', [p.id]);
      productsDeleted += del?.[0]?.affectedRows || 0;
    }

    const productKeys = products.map(p => p.g2bulk_product_id).filter(Boolean);
    if (productKeys.length) {
      await query('DELETE FROM packages WHERE g2bulk_product_id IN (?)', [productKeys]);
      await query('DELETE FROM special_packages WHERE g2bulk_product_id IN (?)', [productKeys]);
    }

    await query('DELETE FROM games WHERE id = ?', [game.id]);

    return res.json({ success: true, game: game.name, products_deleted: productsDeleted });
  } catch (err) {
    console.error('[vg-products] Delete category error:', err);
    return res.status(500).json({ error: err.message });
  }
});

// Admin: live G2Bulk unit prices (1s polling from the VG Prices tab)
let livePriceCache = null;
async function fetchLivePrices() {
  const now = Date.now();
  if (livePriceCache && now - livePriceCache.fetchedAt < 5000) {
    return livePriceCache; // G2Bulk data doesn't change 5x/second — cache between polls
  }
  const cfg = await queryOne("SELECT * FROM api_configurations WHERE api_name = 'g2bulk' AND is_enabled = 1");
  if (!cfg?.api_secret) return { prices: {}, error: 'G2Bulk not configured' };
  try {
    const res = await fetch(`${G2BULK_API_URL}/products`, {
      headers: { 'Accept': 'application/json', 'Content-Type': 'application/json', 'X-API-Key': cfg.api_secret },
    });
    if (!res.ok) return { prices: {}, error: `G2Bulk HTTP ${res.status}` };
    const data = await res.json();
    const prices = {};
    for (const prod of (Array.isArray(data.products) ? data.products : [])) {
      const unitPrice = parseFloat(prod.unit_price ?? prod.amount);
      if (Number.isFinite(unitPrice) && unitPrice > 0) {
        prices[`card_${prod.id}`] = Math.round(unitPrice * 100) / 100;
      }
    }
    livePriceCache = { prices, fetchedAt: Date.now() };
    return livePriceCache;
  } catch (err) {
    return { prices: {}, error: err.message };
  }
}

router.get('/live-prices', livePriceLimiter, requireAdmin, async (req, res) => {
  try {
    const result = await fetchLivePrices();
    return res.json({ ...result, updated_at: new Date().toISOString() });
  } catch (err) {
    console.error('[vg-products] Live prices error:', err);
    return res.status(500).json({ error: err.message });
  }
});

// Admin: imported VG category games (editable in Games tab) + current markup %
router.get('/games', requireAdmin, async (req, res) => {
  try {
    const [rows] = await query(
      `SELECT id, name, slug, image, description, g2bulk_category_id, tags
       FROM games WHERE g2bulk_category_id IS NOT NULL AND tags LIKE '%vg%'
       ORDER BY sort_order ASC, name ASC`
    );
    const markup = await getVgMarkupPercent();
    return res.json({
      games: rows.map(r => ({ ...r, tags: parseTags(r.tags) })),
      markup,
    });
  } catch (err) {
    console.error('[vg-products] Games list error:', err);
    return res.status(500).json({ error: err.message });
  }
});

// Admin: set VG markup % and reprice every imported VG product
router.post('/markup', requireAdmin, async (req, res) => {
  const markup = parseFloat(req.body?.markup);
  if (!Number.isFinite(markup) || markup < 0 || markup > 500) {
    return res.status(400).json({ error: 'markup must be a number between 0 and 500' });
  }
  try {
    await query(
      "INSERT INTO site_settings (id, `key`, value) VALUES (UUID(), 'vg_markup_percent', ?) ON DUPLICATE KEY UPDATE value = VALUES(value)",
      [JSON.stringify(markup)]
    );
    const [rows] = await query("SELECT id, price, fields FROM g2bulk_products WHERE product_type = 'card'");
    let updated = 0;
    for (const r of rows) {
      const fields = parseFields(r.fields);
      // Legacy rows may lack unit_price — fall back to current sell price as the baseline
      let unitPrice = parseFloat(fields.unit_price);
      if (!Number.isFinite(unitPrice) || unitPrice <= 0) unitPrice = parseFloat(r.price);
      if (!Number.isFinite(unitPrice) || unitPrice <= 0) continue;
      const price = applyMarkup(unitPrice, markup);
      const newFields = { ...fields, unit_price: unitPrice, markup_percent: markup };
      await query('UPDATE g2bulk_products SET price = ?, fields = ? WHERE id = ?', [price, JSON.stringify(newFields), r.id]);
      updated++;
    }
    return res.json({ success: true, markup, updated });
  } catch (err) {
    console.error('[vg-products] Set markup error:', err);
    return res.status(500).json({ error: err.message });
  }
});

// Public: live G2Bulk stock + prices for one category (5s polling on the shop page)
const liveCatCache = new Map(); // categoryId -> { data, fetchedAt }
function normalizeStock(raw) {
  if (raw === null || raw === undefined || raw === '') return null;
  if (typeof raw === 'number') return raw > 0 ? Math.floor(raw) : 0;
  const s = String(raw).toLowerCase().trim();
  if (!s) return null;
  const digits = s.match(/\d+/);
  const numeric = digits ? Math.floor(Number(digits[0])) : null;
  if (s.includes('out') || s.includes('sold') || s.includes('unavailable') || s.includes('empty') || s.includes('none') || s.includes('no stock')) {
    return numeric ? numeric : 0;
  }
  if (numeric !== null) return Math.max(0, numeric);
  if (s.includes('in') || s.includes('available') || s.includes('stock')) return null;
  return null;
}
router.get('/:slug/live', async (req, res) => {
  try {
    const game = await queryOne('SELECT g2bulk_category_id FROM games WHERE slug = ?', [req.params.slug]);
    if (!game?.g2bulk_category_id) return res.status(404).json({ error: 'Category not found' });
    const catId = String(game.g2bulk_category_id);
    const now = Date.now();
    const cached = liveCatCache.get(catId);
    if (cached && now - cached.fetchedAt < 10000) {
      return res.json({ ...cached.data, updated_at: new Date().toISOString() });
    }
    const cfg = await queryOne("SELECT * FROM api_configurations WHERE api_name = 'g2bulk' AND is_enabled = 1");
    if (!cfg?.api_secret) return res.json({ stock: {}, prices: {}, error: 'G2Bulk not configured' });
    const prodRes = await fetch(`${G2BULK_API_URL}/category/${catId}`, {
      headers: { 'Accept': 'application/json', 'Content-Type': 'application/json', 'X-API-Key': cfg.api_secret },
    });
    if (!prodRes.ok) return res.json({ stock: {}, prices: {}, error: `G2Bulk HTTP ${prodRes.status}` });
    const data = await prodRes.json();
    const stock = {};
    const prices = {};
    for (const prod of (Array.isArray(data.products) ? data.products : [])) {
      const key = `card_${prod.id}`;
      stock[key] = normalizeStock(prod.stock);
      const unitPrice = parseFloat(prod.unit_price ?? prod.amount);
      if (Number.isFinite(unitPrice) && unitPrice > 0) prices[key] = Math.round(unitPrice * 100) / 100;
    }
    const result = { stock, prices };
    liveCatCache.set(catId, { data: result, fetchedAt: Date.now() });
    return res.json({ ...result, updated_at: new Date().toISOString() });
  } catch (err) {
    console.error('[vg-products] Live stock error:', err);
    return res.status(500).json({ error: err.message });
  }
});

// Public: single VG category game by slug (game header + its products)
router.get('/:slug', async (req, res) => {
  try {
    const game = await queryOne('SELECT * FROM games WHERE slug = ?', [req.params.slug]);
    if (!game?.g2bulk_category_id) return res.status(404).json({ error: 'Category not found' });
    const [rows] = await query(
      `SELECT id, g2bulk_product_id, g2bulk_type_id, product_name AS name, denomination AS description,
              price, currency, fields, product_type, is_active
       FROM g2bulk_products
       WHERE product_type = 'card' AND is_active = 1 AND price > 0
         AND (JSON_UNQUOTE(JSON_EXTRACT(fields, '$.category_id')) = ?
              OR JSON_UNQUOTE(JSON_EXTRACT(fields, '$.category_title')) = ?)
       ORDER BY price ASC`,
      [String(game.g2bulk_category_id), game.name]
    );
    return res.json({
      game: {
        id: game.id,
        name: game.name,
        slug: game.slug,
        image: game.image,
        description: game.description,
        cover_image: game.cover_image,
        tags: parseTags(game.tags),
      },
      products: rows.map(r => mapProductRow(r)),
    });
  } catch (err) {
    console.error('[vg-products] Single category error:', err);
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
    let gamesCreated = 0;
    const seenCategories = new Map(); // category_id -> { title, image }
    const markupPercent = await getVgMarkupPercent();
    for (const prod of prodData.products) {
      if (onlyIds && !onlyIds.has(String(prod.id))) continue;
      // G2Bulk products return: { id, title, description, category_id, category_title, unit_price, image_url, stock }
      const pName = prod.title || prod.name || `Card ${prod.id}`;
      const unitPrice = parseFloat(prod.unit_price ?? prod.amount) || 0;
      const finalPrice = applyMarkup(unitPrice, markupPercent);
      const fields = {
        category: product_type,
        category_id: prod.category_id != null ? String(prod.category_id) : null,
        category_title: prod.category_title || null,
        unit_price: unitPrice,
        stock: prod.stock ?? null,
        image_url: prod.image_url || null,
      };
      await query(
        `INSERT INTO g2bulk_products (id, g2bulk_type_id, g2bulk_product_id, game_name, product_name, denomination, price, currency, fields, is_active, product_type)
         VALUES (UUID(), '', ?, ?, ?, ?, ?, 'USD', ?, 1, 'card')
         ON DUPLICATE KEY UPDATE game_name = VALUES(game_name), product_name = VALUES(product_name), denomination = VALUES(denomination), price = VALUES(price), fields = VALUES(fields), is_active = 1, product_type = 'card'`,
        [`card_${prod.id}`, pName, pName, unitPrice, finalPrice, JSON.stringify(fields)]
      );
      imported++;
      if (prod.category_id != null && prod.category_title) {
        if (!seenCategories.has(String(prod.category_id))) {
          seenCategories.set(String(prod.category_id), { title: prod.category_title, image: prod.image_url || null });
        }
      }
    }

    // Import each category as an editable game (icon/name/slug in Games tab)
    for (const [cid, cat] of seenCategories) {
      if (await upsertCategoryGame(cid, cat.title, cat.image)) gamesCreated++;
    }

    return res.json({
      success: true,
      imported,
      games: seenCategories.size,
      games_created: gamesCreated,
      message: seenCategories.size
        ? `${imported} products · ${seenCategories.size} categor${seenCategories.size !== 1 ? 'ies' : 'y'} added as game${seenCategories.size !== 1 ? 's' : ''}`
        : null,
    });
  } catch (err) {
    console.error('[vg-products] Import error:', err);
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
