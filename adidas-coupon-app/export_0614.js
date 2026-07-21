const { Pool } = require('pg');
const XLSX = require('xlsx');
const path = require('path');

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
        console.log('✓ DB 연결 중...');
        const conn = await pool.connect();

        const coupons = [];
        const result = await conn.query('SELECT email, owned_vouchers FROM adidas_accounts');

        for (const row of result.rows) {
            if (!row.owned_vouchers) continue;
            try {
                const vouchers = JSON.parse(row.owned_vouchers);
                for (const v of vouchers) {
                    const code = v.code || '';
                    const fetched = v.fetched_at || '';

                    // 6월 14일에 발급된 REKR100 또는 REKR50만
                    if (!fetched.startsWith('[26-06-14')) continue;
                    if (!code.startsWith('REKR100') && !code.startsWith('REKR50')) continue;

                    let couponType = '';
                    if (code.startsWith('REKR100')) {
                        couponType = '10만원권';
                    } else if (code.startsWith('REKR50')) {
                        couponType = '5만원권';
                    }

                    coupons.push({
                        email: row.email,
                        type: couponType,
                        code: code,
                        fetched: fetched,
                        sold: v.sold ? '사용' : '미사용'
                    });
                }
            } catch (e) {
                continue;
            }
        }

        conn.release();

        // 쿠폰 종류별 정렬
        coupons.sort((a, b) => {
            if (a.type !== b.type) {
                return a.type === '10만원권' ? -1 : 1;
            }
            return a.fetched.localeCompare(b.fetched);
        });

        console.log(`\n조회 결과:`);
        console.log(`  10만원권: ${coupons.filter(c => c.type === '10만원권').length}개`);
        console.log(`  5만원권: ${coupons.filter(c => c.type === '5만원권').length}개`);
        console.log(`  합계: ${coupons.length}개\n`);

        if (coupons.length > 0) {
            // 엑셀 생성
            const data = [
                ['쿠폰종류', '쿠폰코드', '계정', '발행일', '사용여부']
            ];

            coupons.forEach(c => {
                data.push([c.type, c.code, c.email, c.fetched, c.sold]);
            });

            const workbook = XLSX.utils.book_new();
            const worksheet = XLSX.utils.aoa_to_sheet(data);

            // 컬럼 너비 설정
            worksheet['!cols'] = [
                { wch: 12 },  // 쿠폰종류
                { wch: 28 },  // 쿠폰코드
                { wch: 28 },  // 계정
                { wch: 16 },  // 발행일
                { wch: 10 }   // 사용여부
            ];

            XLSX.utils.book_append_sheet(workbook, worksheet, '6월14일발급');

            // 파일 저장
            const outputDir = 'c:\\개인\\01_shoepalace\\01_입출고관리시스템\\소스코드\\adidas-coupon-app';
            const outputPath = path.join(outputDir, `쿠폰_6월14일발급.xlsx`);

            XLSX.writeFile(workbook, outputPath);
            console.log(`✓ 완료! 파일: ${outputPath}`);
        } else {
            console.log('해당 날짜의 쿠폰이 없습니다.');
        }

        await pool.end();

    } catch (e) {
        console.error('✗ 오류:', e.message);
        process.exit(1);
    }
}

main();
