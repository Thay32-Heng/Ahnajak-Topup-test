/**
 * seed.js — Inserts default data from database/seed.sql
 * Usage: npm run db:seed
 * Idempotent: safe to run multiple times (seed.sql uses INSERT IGNORE)
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const mysql = require('mysql2/promise');

require('dotenv').config({ path: path.resolve(process.cwd(), '.env') });

const DB_HOST = process.env.DB_HOST || 'localhost';
const DB_PORT = parseInt(process.env.DB_PORT || '3306', 10);
const DB_USER = process.env.DB_USER || 'root';
const DB_PASSWORD = process.env.DB_PASSWORD || '';
const DB_NAME = process.env.DB_NAME || 'ahnajak_topup';

async function main() {
  console.log('── MySQL Seed ──');
  console.log(`DB: ${DB_NAME} @ ${DB_HOST}:${DB_PORT}`);
  console.log(`User: ${DB_USER}`);

  const pool = await mysql.createConnection({
    host: DB_HOST,
    port: DB_PORT,
    user: DB_USER,
    password: DB_PASSWORD,
    database: DB_NAME,
    multipleStatements: true,
  });

  const adminPassword = crypto.randomBytes(4).toString('hex');
  const bcrypt = require('bcryptjs');
  const passwordHash = await bcrypt.hash(adminPassword, 10);

  const seedPath = path.resolve(__dirname, '..', 'database', 'seed.sql');
  let sql = fs.readFileSync(seedPath, 'utf8');

  sql = sql.replace(
    /'(\$2[aby]\$[^']+)'/,
    `'${passwordHash}'`
  );

  try {
    // Run schema first to create tables
    const schemaPath = path.resolve(__dirname, '..', 'database', 'schema.sql');
    const schemaSql = fs.readFileSync(schemaPath, 'utf8');
    await pool.query(schemaSql);
    console.log('✓ Schema created successfully');

    // Then run seed data
    await pool.query(sql);
    console.log('✓ Seed data inserted successfully');
    if (process.env.NODE_ENV !== 'production') {
      console.log('  - Default admin user: admin@ahnajak.com / ' + adminPassword);
    }
    console.log('  - Payment gateways (disabled)');
    console.log('  - Default site settings');
    console.log('  - Game verification configs');
    console.log('');

    const credsPath = path.resolve(__dirname, '..', 'admin_credentials.txt');
    fs.writeFileSync(credsPath, `Email: admin@ahnajak.com\nPassword: ${adminPassword}\n`, 'utf8');
    console.log(`  Admin credentials saved to admin_credentials.txt`);
    console.log('');
    console.log('⚠  CHANGE the admin password immediately after first login!');
  } catch (err) {
    console.error('✗ Seed failed:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main().catch(err => {
  console.error('✗ Error:', err.message);
  process.exit(1);
});
