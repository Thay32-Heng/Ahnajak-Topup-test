/**
 * routes/settings.cjs — site_settings key-value CRUD
 * GET  /api/settings          — get all settings (public)
 * PUT   /api/settings         — bulk upsert settings (admin)
 * PUT   /api/settings/:key    — upsert a single setting (admin)
 * DELETE /api/settings/:key   — delete a setting (admin)
 */
const express = require('express');
const fs = require('fs');
const path = require('path');
const { query, queryOne } = require('../db.cjs');
const { requireAuth, requireAdmin, optionalAuth } = require('../auth.cjs');
const { sendError } = require('../helpers/errors.cjs');

const router = express.Router();

// Get all settings (public — site settings are public data)
router.get('/', optionalAuth, async (req, res) => {
  try {
    const [rows] = await query('SELECT `key`, value FROM site_settings');
    // Return as { key: parsedValue } map
    const settings = {};
    for (const row of rows) {
      try { settings[row.key] = typeof row.value === 'string' ? JSON.parse(row.value) : row.value; }
      catch { settings[row.key] = row.value; }
    }
    res.json(settings);
  } catch (err) { sendError(res, err, 'GET /settings'); }
});

// Bulk upsert (admin)
router.put('/', requireAuth, requireAdmin, async (req, res) => {
  const entries = req.body;
  if (!entries || typeof entries !== 'object') {
    return res.status(400).json({ error: 'Expected a JSON object of key/value pairs' });
  }
  try {
    for (const [key, value] of Object.entries(entries)) {
      await query(
        'INSERT INTO site_settings (id, `key`, value) VALUES (UUID(), ?, ?) ON DUPLICATE KEY UPDATE value = VALUES(value)',
        [key, JSON.stringify(value)]
      );
    }
    res.json({ success: true });
  } catch (err) { sendError(res, err, 'PUT /settings'); }
});

// Bulk delete all settings (admin — used by DatabaseExportImport)
router.delete('/', requireAuth, requireAdmin, async (req, res) => {
  try {
    await query('DELETE FROM site_settings');
    res.json({ success: true });
  } catch (err) { sendError(res, err, 'DELETE /settings'); }
});

// Upsert single setting (admin)
router.put('/:key', requireAuth, requireAdmin, async (req, res) => {
  const { key } = req.params;
  const { value } = req.body;
  try {
    await query(
      'INSERT INTO site_settings (id, `key`, value) VALUES (UUID(), ?, ?) ON DUPLICATE KEY UPDATE value = VALUES(value)',
      [key, JSON.stringify(value)]
    );
    res.json({ success: true });
  } catch (err) { sendError(res, err, 'PUT /settings/:key'); }
});

// Delete single setting (admin)
router.delete('/:key', requireAuth, requireAdmin, async (req, res) => {
  const { key } = req.params;
  try {
    await query('DELETE FROM site_settings WHERE `key` = ?', [key]);
    res.json({ success: true });
  } catch (err) { sendError(res, err, 'DELETE /settings/:key'); }
});

// Train AI with active branding and colors (admin)
router.post('/ai-train', requireAuth, requireAdmin, async (req, res) => {
  const { siteName, primaryColor, accentColor, bgType, backgroundColor, bgImageUrl, bgVideoUrl } = req.body;
  if (!siteName) return res.status(400).json({ error: 'siteName is required' });

  try {
    const agentsDir = path.resolve(process.cwd(), '.agents');
    if (!fs.existsSync(agentsDir)) {
      fs.mkdirSync(agentsDir, { recursive: true });
    }

    const guidelines = `# Ahnajak Topup AI Customization Guidelines

This file is automatically updated by the AI Admin Panel. It instructs future developer AI agents on the active branding and theme configuration of the application.

## Active Branding
- **Brand Name**: "${siteName}"
- **Browser Title**: "${siteName} - Game Topup Cambodia"

## Active Theme Colors
- **Primary Color**: "${primaryColor || '#0ea5e9'}"
- **Accent Color**: "${accentColor || '#0284c7'}"
- **Background Theme**: "Dark (Pitch Black)"
- **Background Mode**: "${bgType || 'color'}"
- **Background Color**: "${backgroundColor || '#000000'}"
- **Background Image URL**: "${bgImageUrl || 'None'}"
- **Background Video URL**: "${bgVideoUrl || 'None'}"

## Guidelines for AI Developer Agents
1. When generating new components, pages, or layouts, always use the active brand name: "${siteName}".
2. Use the primary color token \`var(--primary)\` or \`text-gold\` (which resolves to the active color ${primaryColor}) for all accents.
3. Keep the dark theme active (pitch black background \`#000000\`).
`;

    fs.writeFileSync(path.join(agentsDir, 'AGENTS.md'), guidelines, 'utf8');
    res.json({ success: true });
  } catch (err) { sendError(res, err, 'POST /settings/ai-train'); }
});

module.exports = router;
