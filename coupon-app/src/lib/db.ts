import { Pool, PoolClient } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30000,
});

export async function query(text: string, params?: any[]) {
  return pool.query(text, params);
}

export async function queryOne(text: string, params?: any[]) {
  const result = await pool.query(text, params);
  return result.rows[0] || null;
}

export async function queryAll(text: string, params?: any[]) {
  const result = await pool.query(text, params);
  return result.rows;
}

export async function getClient(): Promise<PoolClient> {
  return pool.connect();
}

// card_app_users 테이블 보장 (카드앱과 공유)
export async function ensureAuthTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS card_app_users (
      id SERIAL PRIMARY KEY,
      username VARCHAR(100) UNIQUE NOT NULL,
      password_hash VARCHAR(200) NOT NULL,
      display_name VARCHAR(100),
      phone VARCHAR(20),
      role VARCHAR(20) DEFAULT 'user',
      group_id INTEGER,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);

  // 초기 관리자 계정
  const admin = await queryOne('SELECT id FROM card_app_users WHERE username = $1', [process.env.ADMIN_USERNAME || 'admin']);
  if (!admin) {
    const bcrypt = require('bcryptjs');
    const hash = await bcrypt.hash(process.env.ADMIN_PASSWORD || 'admin1234', 10);
    await pool.query(
      'INSERT INTO card_app_users (username, password_hash, display_name, role) VALUES ($1, $2, $3, $4)',
      [process.env.ADMIN_USERNAME || 'admin', hash, '관리자', 'super_admin']
    );
  }
}

// adidas_accounts 테이블 보장
export async function ensureAdidasTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS adidas_accounts (
      id SERIAL PRIMARY KEY,
      email VARCHAR(255) UNIQUE,
      password VARCHAR(255),
      name VARCHAR(100),
      phone VARCHAR(50),
      birthday VARCHAR(20),
      adikr_barcode VARCHAR(100),
      memo TEXT,
      is_active BOOLEAN DEFAULT true,
      current_points INTEGER DEFAULT 0,
      owned_vouchers JSONB DEFAULT '[]',
      web_fetch_status VARCHAR(50),
      mobile_fetch_status VARCHAR(50),
      web_issue_status VARCHAR(50),
      mobile_issue_status VARCHAR(50),
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `);
}

export default pool;
