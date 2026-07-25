const express = require('express');
const crypto = require('crypto');
const { query, queryOne, uuid } = require('../db.cjs');
const { signToken } = require('../auth.cjs');
const { sendError } = require('../helpers/errors.cjs');

const router = express.Router();

function generateAuthCode() {
  return crypto.randomBytes(4).toString('hex').toUpperCase();
}

// Get bot config (username, availability)
router.get('/bot-auth/config', (req, res) => {
  const botUsername = process.env.TELEGRAM_BOT_USERNAME || '';
  const botConfigured = !!(process.env.TELEGRAM_BOT_USERNAME && process.env.TELEGRAM_BOT_TOKEN);
  res.json({ bot_username: botUsername, configured: botConfigured });
});

// Initiate bot auth — returns auth code + bot username
router.post('/bot-auth/init', async (req, res) => {
  try {
    const botUsername = process.env.TELEGRAM_BOT_USERNAME;
    if (!botUsername) return res.status(500).json({ error: 'Telegram bot not configured' });

    // Clean expired pending codes
    await query("DELETE FROM telegram_auth_codes WHERE status = 'pending' AND created_at < NOW() - INTERVAL 5 MINUTE");

    let authCode;
    let attempts = 0;
    while (attempts < 10) {
      authCode = generateAuthCode();
      const existing = await queryOne('SELECT id FROM telegram_auth_codes WHERE auth_code = ?', [authCode]);
      if (!existing) break;
      attempts++;
    }
    if (!authCode) return res.status(500).json({ error: 'Failed to generate code' });

    const id = uuid();
    await query(
      `INSERT INTO telegram_auth_codes (id, auth_code, status) VALUES (?, ?, 'pending')`,
      [id, authCode]
    );

    res.json({ auth_code: authCode, bot_username: botUsername });
  } catch (err) { sendError(res, err, 'POST /bot-auth/init'); }
});

// Poll auth status — returns JWT when confirmed
router.get('/bot-auth/status', async (req, res) => {
  const { code } = req.query;
  if (!code) return res.status(400).json({ error: 'Code required' });

  try {
    const record = await queryOne('SELECT status, telegram_id, telegram_username FROM telegram_auth_codes WHERE auth_code = ?', [code]);
    if (!record) return res.json({ status: 'expired' });

    if (record.status === 'confirmed' && record.telegram_id) {
      const telegramId = String(record.telegram_id);
      const email = `tg_${telegramId}@telegram.local`;

      let user = await queryOne('SELECT id, email, display_name FROM users WHERE email = ?', [email]);
      if (!user) {
        const userId = uuid();
        await query('INSERT INTO users (id, email, password_hash, display_name) VALUES (?, ?, "", ?)',
          [userId, email, record.telegram_username || 'Telegram User']);
        await query('INSERT INTO profiles (id, user_id, email, display_name, wallet_balance, reward_points) VALUES (?, ?, ?, ?, 0, 0)',
          [uuid(), userId, email, record.telegram_username || 'Telegram User']);
        await query('INSERT INTO user_roles (id, user_id, role) VALUES (?, ?, ?)',
          [uuid(), userId, 'user']);
        user = { id: userId, email, display_name: record.telegram_username || 'Telegram User' };
      }

      const token = signToken({ id: user.id, email: user.email, display_name: user.display_name });

      // Clean up used code
      await query('DELETE FROM telegram_auth_codes WHERE auth_code = ?', [code]);

      return res.json({ status: 'confirmed', token, user: { id: user.id, email: user.email, display_name: user.display_name } });
    }

    // Check expiry
    const created = new Date(record.created_at || Date.now()).getTime();
    if (Date.now() - created > 5 * 60 * 1000) {
      await query("UPDATE telegram_auth_codes SET status = 'expired' WHERE auth_code = ?", [code]);
      return res.json({ status: 'expired' });
    }

    res.json({ status: 'pending' });
  } catch (err) { sendError(res, err, 'GET /bot-auth/status'); }
});

// Webhook called by your bot — confirms auth code
router.post('/bot-auth/webhook', async (req, res) => {
  const { auth_code, telegram_id, telegram_username } = req.body;
  if (!auth_code || !telegram_id) {
    return res.status(400).json({ error: 'auth_code and telegram_id required' });
  }

  // Verify webhook secret
  const expectedSecret = process.env.TELEGRAM_BOT_WEBHOOK_SECRET;
  if (expectedSecret) {
    const provided = req.headers['x-webhook-secret'] || '';
    if (provided !== expectedSecret) {
      return res.status(401).json({ error: 'Invalid webhook secret' });
    }
  }

  try {
    const result = await query(
      `UPDATE telegram_auth_codes SET status = 'confirmed', telegram_id = ?, telegram_username = ?, confirmed_at = NOW()
       WHERE auth_code = ? AND status = 'pending'`,
      [String(telegram_id), telegram_username || null, auth_code]
    );

    if (result[0].affectedRows === 0) {
      return res.json({ success: false, error: 'Invalid or expired auth code' });
    }

    res.json({ success: true });
  } catch (err) { sendError(res, err, 'POST /bot-auth/webhook'); }
});

// Telegram bot webhook — receives updates directly from Telegram
// Set this as your bot's webhook via:
//   curl "https://api.telegram.org/bot<token>/setWebhook?url=https://yourdomain.com/api/auth/telegram-webhook"
router.post('/telegram-webhook', async (req, res) => {
  const update = req.body;
  // Acknowledge immediately (Telegram resends if we don't respond in time)
  res.json({ ok: true });

  try {
    const message = update?.message;
    if (!message || !message.text) return;

    const chatId = message.chat.id;
    const text = String(message.text).trim();
    const telegramId = String(message.from?.id || '');
    const telegramUsername = message.from?.username || null;

    // Parse /start <CODE>
    const match = text.match(/^\/start\s+([A-Za-z0-9]+)/i);
    if (!match) {
      // No code — send welcome
      const botUsername = process.env.TELEGRAM_BOT_USERNAME;
      if (!botUsername) return;
      const token = process.env.TELEGRAM_BOT_TOKEN;
      if (!token) return;
      const welcomeText = `Welcome! To log in to the website, please open the login page and click "Login with Telegram", then send the code you see here:\n/start <code>`;
      await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text: welcomeText }),
      });
      return;
    }

    const authCode = match[1].toUpperCase();
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) return;

    // Confirm the auth code
    const result = await query(
      `UPDATE telegram_auth_codes SET status = 'confirmed', telegram_id = ?, telegram_username = ?, confirmed_at = NOW()
       WHERE auth_code = ? AND status = 'pending'`,
      [telegramId, telegramUsername, authCode]
    );

    if (result[0].affectedRows > 0) {
      await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text: '✅ Login confirmed! You can close Telegram and return to the website.' }),
      });
    } else {
      await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text: '❌ Invalid or expired code. Please try logging in again from the website.' }),
      });
    }
  } catch (err) {
    console.error('[Telegram webhook] Error:', err.message);
  }
});

module.exports = router;
