/**
 * server/index.cjs — Main Express API server
 * Replaces: api-server.cjs + all 15 Supabase Edge Functions
 *
 * Serves:
 *   - Auth endpoints (JWT-based)
 *   - All CRUD operations (games, packages, orders, settings, etc.)
 *   - Edge function ports (process-topup, verify-game, g2bulk, khqr, etc.)
 *   - File uploads (replaces Supabase Storage)
 *   - Proxy image / icon search
 *
 * Run: npm run dev:server  or  node server/index.cjs
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(process.cwd(), '.env') });

const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const app = express();
const PORT = parseInt(process.env.PORT || '3010', 10);

// ── Middleware ──────────────────────────────────────────────────────────────
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : 'http://localhost:5173',
  credentials: true,
}));
app.use(express.json({ limit: '2mb' }));

// Security headers
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  res.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' data: https:; font-src 'self' data: https://fonts.gstatic.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; script-src 'self' 'unsafe-inline' https://telegram.org");
  next();
});

// Rate limiting on auth endpoints
const authLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { error: 'Too many requests — please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Serve uploaded files statically
app.use('/uploads', express.static(path.resolve(process.cwd(), 'uploads')));

// Health check
app.get('/api/health', (req, res) => res.json({ ok: true, time: new Date().toISOString() }));
app.post('/api/test-post', (req, res) => res.json({ ok: true, method: 'POST works' }));

// ── Mount routes ────────────────────────────────────────────────────────────
// Each router replaces a specific Supabase feature (see route file headers for details)

// Auth (replaces Supabase Auth)
app.use('/api/auth', authLimiter, require('./routes/auth.cjs'));

// Settings (site_settings CRUD)
app.use('/api/settings', require('./routes/settings.cjs'));

// Games + packages + special_packages CRUD
app.use('/api/games', require('./routes/games.cjs'));

// Orders (topup_orders + polling)
app.use('/api/orders', require('./routes/orders.cjs'));

// Preorders
app.use('/api/preorders', require('./routes/preorders.cjs'));

// Events
app.use('/api/events', require('./routes/events.cjs'));

// Event Banners (homepage promotion banners)
app.use('/api/event-banners', require('./routes/event-banners.cjs'));

// Coupons (apply_coupon RPC replacement)
app.use('/api/coupons', require('./routes/coupons.cjs'));

// Points (exchange_points_for_coupon RPC replacement)
app.use('/api/points', require('./routes/points.cjs'));

// Wallet
const { router: walletRouter } = require('./routes/wallet.cjs');
app.use('/api/wallet', walletRouter);

// Payments (gateway config, create-payment, webhooks)
app.use('/api/payments', require('./routes/payments.cjs'));

// Uploads (replaces Supabase Storage)
app.use('/api/upload', require('./routes/uploads.cjs'));

// API configs + game verification + g2bulk products
app.use('/api/admin', require('./routes/api-configs.cjs'));

// ── Edge function ports ─────────────────────────────────────────────────────
// Each replaces a Supabase edge function with the same API contract

app.use('/api/process-topup', require('./routes/process-topup.cjs'));
app.use('/api/verify-game-id', require('./routes/verify-game.cjs'));
app.use('/api/g2bulk-api', require('./routes/g2bulk.cjs'));
app.use('/api/ahnajak-khqr', require('./routes/ahnajak-khqr.cjs'));
app.use('/api/ikhode-payment', require('./routes/ikhode.cjs'));
app.use('/api/update-prices', require('./routes/prices.cjs'));

// Image search (SerpApi Google Images)
app.use('/api', require('./routes/image-search.cjs'));

// Misc (edge function aliases: get-ikhode-public-config, khqrcc-payment, etc.)
app.use('/api', require('./routes/misc.cjs'));

// ── Auto-migration ───────────────────────────────────────────────────────────
const { pool } = require('./db.cjs');
(async () => {
  try {
    const conn = await pool.getConnection();
    await conn.query(`CREATE TABLE IF NOT EXISTS event_banners (
      id          CHAR(36)     NOT NULL DEFAULT (UUID()) PRIMARY KEY,
      title       VARCHAR(255) DEFAULT NULL,
      image       TEXT         NOT NULL,
      link        TEXT         DEFAULT NULL,
      is_active   TINYINT(1)   NOT NULL DEFAULT 1,
      sort_order  INT          DEFAULT 0,
      created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )`);
    conn.release();
    console.log('  ✓ Auto-migration: event_banners table ready');
  } catch (err) {
    console.error('  ✗ Auto-migration failed:', err.message);
  }
})();

// ── Start server ────────────────────────────────────────────────────────────
app.listen(PORT, '0.0.0.0', () => {
  console.log('\n' +
    '╔══════════════════════════════════════════════╗\n' +
    '║   Ahnajak Topup API Server v2 (MySQL)        ║\n' +
    `║   Port: ${PORT}                                   ║\n` +
    '║   Auth: JWT + bcrypt                         ║\n' +
    '║   Uploads: /uploads/site-assets              ║\n' +
    '╚══════════════════════════════════════════════╝\n');
});