const { Pool } = require('pg');

const DB_CONFIG = {
    host: '129.212.227.252',
    port: 5433,
    database: 'shoepalace',
    user: 'shoepalace_user',
    password: 'shoepalace_pass'
};

async function main() {
    const pool = new Pool(DB_CONFIG);
    const TARGET = 'REKR50-T3BF-49HK-S7B3-7D2Q';

    try {
        const conn = await pool.connect();
        const result = await conn.query('SELECT email, owned_vouchers FROM adidas_accounts');

        for (const row of result.rows) {
            if (!row.owned_vouchers) continue;
            try {
                const vouchers = JSON.parse(row.owned_vouchers);
                for (const v of vouchers) {
                    if (v.code === TARGET) {
                        console.log(`✓ 5만원권 쿠폰 발견!\n`);
                        console.log(`계정:      ${row.email}`);
                        console.log(`쿠폰코드:  ${v.code}`);
                        console.log(`발행일:    ${v.fetched_at}`);
                        console.log(`만료일:    ${v.expiry_date || '(없음)'}`);
                        console.log(`사용여부:  ${v.sold ? '사용됨' : '미사용'}`);

                        conn.release();
                        await pool.end();
                        return;
                    }
                }
            } catch (e) {}
        }

        console.log(`✗ 쿠폰을 찾을 수 없음: ${TARGET}`);
        conn.release();
        await pool.end();

    } catch (e) {
        console.error('오류:', e.message);
        process.exit(1);
    }
}

main();
