/**
 * routes/wallet.cjs — wallet transactions + balance (replaces process_wallet_transaction RPC)
 */
const express = require('express');
const { query, queryOne, uuid } = require('../db.cjs');
const { requireAuth, requireAdmin } = require('../auth.cjs');
const { sendError } = require('../helpers/errors.cjs');

const router = express.Router();

// Get user's wallet balance + transactions (auth)
router.get('/', requireAuth, async (req, res) => {
  try {
    const profile = await queryOne('SELECT wallet_balance FROM profiles WHERE user_id = ?', [req.user.id]);
    const [transactions] = await query('SELECT * FROM wallet_transactions WHERE user_id = ? ORDER BY created_at DESC LIMIT 100', [req.user.id]);
    res.json({ balance: parseFloat(profile?.wallet_balance || 0), transactions });
  } catch (err) { sendError(res, err, 'GET /wallet'); }
});

// Process a wallet transaction atomically (replaces RPC process_wallet_transaction)
// Called internally by process-topup and other backend routes, not exposed to frontend directly.
async function processWalletTransaction(userId, type, amount, description = null, referenceId = null) {
  const conn = await require('../db.cjs').pool.getConnection();
  try {
    await conn.beginTransaction();

    const [rows] = await conn.query('SELECT wallet_balance FROM profiles WHERE user_id = ? FOR UPDATE', [userId]);
    if (!rows.length) throw new Error('User profile not found');

    const parsedAmt = parseFloat(amount);
    if (!Number.isFinite(parsedAmt)) throw new Error('Invalid amount');

    const currentBalance = parseFloat(rows[0].wallet_balance || 0);
    const newBalance = currentBalance + parsedAmt;

    if (parsedAmt < 0 && newBalance < 0) {
      throw new Error('Insufficient balance');
    }

    const txId = uuid();
    await conn.query(
      `INSERT INTO wallet_transactions (id, user_id, type, amount, balance_before, balance_after, description, reference_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [txId, userId, type, amount, currentBalance, newBalance, description, referenceId]
    );
    await conn.query('UPDATE profiles SET wallet_balance = ?, updated_at = NOW() WHERE user_id = ?', [newBalance, userId]);

    await conn.commit();
    return { success: true, transaction_id: txId, new_balance: newBalance, balance_before: currentBalance };
  } catch (err) {
    await conn.rollback();
    return { success: false, error: err.message };
  } finally {
    conn.release();
  }
}

// Top up wallet (admin only — with amount cap and mandatory description for audit trail)
router.post('/topup', requireAuth, requireAdmin, async (req, res) => {
  const { amount, description, reference_id } = req.body;
  if (amount == null) return res.status(400).json({ error: 'amount required' });
  const parsedAmount = parseFloat(amount);
  if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) return res.status(400).json({ error: 'Amount must be a valid positive number' });
  if (parsedAmount > 10000) return res.status(400).json({ error: 'Amount exceeds maximum ($10,000). Contact owner for larger amounts.' });
  if (!description || description.length < 3) return res.status(400).json({ error: 'A description is required for audit purposes' });
  try {
    const result = await processWalletTransaction(req.user.id, 'topup', parsedAmount, `Admin topup: ${description}`, reference_id || null);
    if (!result.success) return res.status(400).json(result);
    console.warn(`[AUDIT] Admin wallet topup: user=${req.user.email}, amount=${parsedAmount}, description=${description}`);
    res.json(result);
  } catch (err) { sendError(res, err, 'POST /wallet/topup'); }
});

module.exports = { router, processWalletTransaction };
