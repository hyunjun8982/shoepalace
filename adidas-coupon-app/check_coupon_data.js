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

    try {
        const conn = await pool.connect();

        // 대상 쿠폰 찾기
        const result = await conn.query('SELECT email, owned_vouchers FROM adidas_accounts LIMIT 5');
        console.log('=== 샘플 쿠폰 데이터 ===\n');

        for (const row of result.rows) {
            console.log(`계정: ${row.email}`);
            if (!row.owned_vouchers) {
                console.log('  (쿠폰 없음)\n');
                continue;
            }
            try {
                const vouchers = JSON.parse(row.owned_vouchers);
                console.log(`  쿠폰 수: ${vouchers.length}`);
                vouchers.slice(0, 3).forEach((v, i) => {
                    console.log(`    [${i}]`);
                    console.log(`      type: ${v.type}`);
                    console.log(`      code: ${v.code}`);
                    console.log(`      expiry_date: ${v.expiry_date}`);
                    console.log(`      fetched_at: ${v.fetched_at}`);
                });
                console.log();
            } catch (e) {
                console.log(`  (JSON 파싱 실패)\n`);
            }
        }

        // 10만원권/5만원권 통계
        const allResult = await conn.query('SELECT owned_vouchers FROM adidas_accounts');
        const allCoupons = [];
        const typeStats = {};

        for (const row of allResult.rows) {
            if (!row.owned_vouchers) continue;
            try {
                const vouchers = JSON.parse(row.owned_vouchers);
                vouchers.forEach(v => {
                    allCoupons.push(v);
                    const type = v.type || '(타입 없음)';
                    typeStats[type] = (typeStats[type] || 0) + 1;
                });
            } catch (e) {}
        }

        console.log('=== 쿠폰 종류별 통계 ===');
        Object.entries(typeStats).sort((a, b) => b[1] - a[1]).forEach(([type, count]) => {
            console.log(`${type}: ${count}개`);
        });

        conn.release();
        await pool.end();

    } catch (e) {
        console.error('오류:', e.message);
        process.exit(1);
    }
}

main();
