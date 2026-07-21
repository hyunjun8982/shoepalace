const { Pool } = require('pg');

const DB_CONFIG = {
    host: '129.212.227.252',
    port: 5433,
    database: 'shoepalace',
    user: 'shoepalace_user',
    password: 'shoepalace_pass'
};

function parseTime(fetchedAtStr) {
    if (!fetchedAtStr) return null;
    try {
        const cleaned = fetchedAtStr.trim().replace(/[\[\]]/g, '');
        const [datePart, timePart] = cleaned.split(' ');
        const [yy, mm, dd] = datePart.split('-');
        const year = parseInt('20' + yy);
        const month = parseInt(mm);
        const day = parseInt(dd);
        const [hh, min] = timePart.split(':');
        const hour = parseInt(hh);
        const minute = parseInt(min);
        return new Date(year, month - 1, day, hour, minute, 0);
    } catch (e) {
        return null;
    }
}

async function main() {
    const pool = new Pool(DB_CONFIG);

    try {
        const conn = await pool.connect();

        // 목표 쿠폰 찾기
        const result = await conn.query('SELECT email, owned_vouchers FROM adidas_accounts');
        let targetDate = null;
        const TARGET_COUPON = 'REKR100-BQZC-4C6N-WVL9-KZR2';

        for (const row of result.rows) {
            if (!row.owned_vouchers) continue;
            try {
                const vouchers = JSON.parse(row.owned_vouchers);
                for (const v of vouchers) {
                    if (v.code === TARGET_COUPON) {
                        targetDate = v.fetched_at;
                        console.log(`✓ 목표 쿠폰 발견: ${TARGET_COUPON}`);
                        console.log(`  발행일: ${targetDate}`);
                        console.log();
                        break;
                    }
                }
                if (targetDate) break;
            } catch (e) {}
        }

        if (!targetDate) {
            console.log('목표 쿠폰을 찾을 수 없음');
            conn.release();
            await pool.end();
            return;
        }

        const targetDt = parseTime(targetDate);

        // 전체 REKR100/REKR50 쿠폰 통계
        console.log('=== REKR100/REKR50 쿠폰 발행 시간순 ===\n');

        const allCoupons = [];
        const result2 = await conn.query('SELECT email, owned_vouchers FROM adidas_accounts');

        for (const row of result2.rows) {
            if (!row.owned_vouchers) continue;
            try {
                const vouchers = JSON.parse(row.owned_vouchers);
                for (const v of vouchers) {
                    const code = v.code || '';
                    if (!code.startsWith('REKR100') && !code.startsWith('REKR50')) continue;

                    const issuedDt = parseTime(v.fetched_at);
                    allCoupons.push({
                        code,
                        email: row.email,
                        issued: v.fetched_at,
                        issuedDt,
                        afterTarget: issuedDt > targetDt
                    });
                }
            } catch (e) {}
        }

        // 발행일 정렬
        allCoupons.sort((a, b) => {
            if (!a.issuedDt) return 1;
            if (!b.issuedDt) return -1;
            return a.issuedDt - b.issuedDt;
        });

        // 목표일 주변 데이터 표시
        console.log(`목표일: ${targetDate} (${targetDt})\n`);

        const beforeCount = allCoupons.filter(c => !c.afterTarget).length;
        const afterCount = allCoupons.filter(c => c.afterTarget).length;

        console.log(`목표일 이전: ${beforeCount}개`);
        console.log(`목표일 이후: ${afterCount}개\n`);

        // 마지막 10개 표시
        console.log('=== 마지막 10개 쿠폰 ===');
        allCoupons.slice(-10).forEach(c => {
            const marker = c.afterTarget ? '✓' : ' ';
            console.log(`${marker} ${c.issued} | ${c.code} | ${c.email}`);
        });

        conn.release();
        await pool.end();

    } catch (e) {
        console.error('오류:', e.message);
        process.exit(1);
    }
}

main();
