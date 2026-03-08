import { Pool, PoolClient } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30000,
});

export async function query(text: string, params?: any[]) {
  const result = await pool.query(text, params);
  return result;
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

// groups 테이블 자동 생성
export async function ensureGroupsTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS card_app_groups (
      id SERIAL PRIMARY KEY,
      name VARCHAR(100) UNIQUE NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);
}

// card_app_users 테이블 자동 생성 + 초기 관리자 계정
export async function ensureAuthTable() {
  await ensureGroupsTable();

  await pool.query(`
    CREATE TABLE IF NOT EXISTS card_app_users (
      id SERIAL PRIMARY KEY,
      username VARCHAR(100) UNIQUE NOT NULL,
      password_hash VARCHAR(200) NOT NULL,
      display_name VARCHAR(100),
      phone VARCHAR(20),
      role VARCHAR(20) DEFAULT 'user',
      group_id INTEGER REFERENCES card_app_groups(id),
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);

  // 기존 테이블에 새 컬럼 추가 (이미 존재하면 무시)
  await pool.query(`ALTER TABLE card_app_users ADD COLUMN IF NOT EXISTS phone VARCHAR(20)`);
  await pool.query(`ALTER TABLE card_app_users ADD COLUMN IF NOT EXISTS group_id INTEGER REFERENCES card_app_groups(id)`);

  // 기존 admin → super_admin 마이그레이션
  await pool.query(`UPDATE card_app_users SET role = 'super_admin' WHERE role = 'admin'`);

  // 초기 관리자 계정 생성
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

// 기관 홈페이지 링크 테이블
export async function ensureHomepageTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS institution_homepages (
      id SERIAL PRIMARY KEY,
      organization VARCHAR(10) NOT NULL,
      business_type VARCHAR(2) NOT NULL,
      client_type VARCHAR(1) NOT NULL,
      url TEXT NOT NULL,
      is_active BOOLEAN DEFAULT true,
      UNIQUE(organization, business_type, client_type)
    )
  `);
  await pool.query(`ALTER TABLE institution_homepages ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true`);
}

export default pool;
