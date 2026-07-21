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
        const result = await conn.query('SELECT email, owned_vouchers FROM adidas_accounts');

        const coupons = [];

        for (const row of result.rows) {
            if (!row.owned_vouchers) continue;
            try {
                const vouchers = JSON.parse(row.owned_vouchers);
                for (const v of vouchers) {
                    if (v.code && v.code.startsWith('REKR50')) {
                        coupons.push({
                            code: v.code,
                            email: row.email,
                            fetched_at: v.fetched_at,
                            sold: v.sold
                        });
                    }
                }
            } catch (e) {}
        }

        console.log(`=== REKR50 (5만원권) 통계 ===\n`);
        console.log(`총 개수: ${coupons.length}개\n`);

        // 발행일 유무 분류
        const withDate = coupons.filter(c => c.fetched_at);
        const noDate = coupons.filter(c => !c.fetched_at);

        console.log(`발행일 있음: ${withDate.length}개`);
        console.log(`발행일 없음: ${noDate.length}개\n`);

        // 발행일 역순 정렬 (최신 먼저)
        withDate.sort((a, b) => {
            const dateA = parseDate(a.fetched_at);
            const dateB = parseDate(b.fetched_at);
            if (!dateA) return 1;
            if (!dateB) return -1;
            return dateB - dateA;
        });

        console.log('=== 최근 발행된 5만원권 (상위 20개) ===\n');
        withDate.slice(0, 20).forEach(c => {
            const sold = c.sold ? '(사용)' : '(미사용)';
            console.log(`${c.fetched_at} | ${c.code} ${sold}`);
        });

        console.log('\n=== 발행일 없는 5만원권 (상위 10개) ===\n');
        noDate.slice(0, 10).forEach(c => {
            const sold = c.sold ? '(사용)' : '(미사용)';
            console.log(`${c.code} | ${c.email} ${sold}`);
        });

        conn.release();
        await pool.end();

    } catch (e) {
        console.error('오류:', e.message);
        process.exit(1);
    }
}

function parseDate(dateStr) {
    if (!dateStr) return null;
    try {
        const cleaned = dateStr.trim().replace(/[\[\]]/g, '');
        const [datePart, timePart] = cleaned.split(' ');
        const [yy, mm, dd] = datePart.split('-');
        const year = parseInt('20' + yy);
        const month = parseInt(mm);
        const day = parseInt(dd);
        const [hh, min] = timePart.split(':');
        return new Date(year, month - 1, day, parseInt(hh), parseInt(min), 0);
    } catch (e) {
        return null;
    }
}

main();
