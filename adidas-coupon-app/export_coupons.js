#!/usr/bin/env node
/**
 * 아디다스 쿠폰 조회 스크립트
 * 특정 쿠폰 발행일 이후 발행된 10만원권/5만원권 쿠폰을 엑셀로 추출
 */

const { Pool } = require('pg');
const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');

const DB_CONFIG = {
    host: '129.212.227.252',
    port: 5433,
    database: 'shoepalace',
    user: 'shoepalace_user',
    password: 'shoepalace_pass'
};

const TARGET_COUPON_CODE = 'REKR100-BQZC-4C6N-WVL9-KZR2';
const TARGET_AMOUNTS = ['10만원권', '5만원권'];

async function main() {
    const pool = new Pool(DB_CONFIG);

    try {
        console.log('✓ DB 연결 중...');
        const conn = await pool.connect();

        // 1. 대상 쿠폰의 발행일 조회
        let targetDate = null;
        const result = await conn.query('SELECT id, owned_vouchers FROM adidas_accounts');

        for (const row of result.rows) {
            if (!row.owned_vouchers) continue;
            try {
                const vouchers = JSON.parse(row.owned_vouchers);
                for (const v of vouchers) {
                    if (v.code === TARGET_COUPON_CODE) {
                        targetDate = v.fetched_at;
                        console.log(`✓ 대상 쿠폰 발견: ${TARGET_COUPON_CODE}`);
                        console.log(`  발행일: ${targetDate}`);
                        break;
                    }
                }
                if (targetDate) break;
            } catch (e) {
                continue;
            }
        }

        if (!targetDate) {
            console.log(`✗ 대상 쿠폰을 찾을 수 없음: ${TARGET_COUPON_CODE}`);
            conn.release();
            await pool.end();
            return;
        }

        // 2. 대상 발행일을 Date로 변환
        const targetDt = parseTime(targetDate);
        console.log(`기준 발행일: ${targetDt}`);

        // 3. 이후 발행된 10만원권/5만원권 추출
        const couponsAfter = [];
        const couponsBefore = [];
        const result2 = await conn.query('SELECT id, email, owned_vouchers FROM adidas_accounts');

        for (const row of result2.rows) {
            if (!row.owned_vouchers) continue;
            try {
                const vouchers = JSON.parse(row.owned_vouchers);
                for (const v of vouchers) {
                    const code = v.code || '';

                    // 쿠폰 종류 판단 (코드 패턴)
                    let couponType = '';
                    if (code.startsWith('REKR100')) {
                        couponType = '10만원권';
                    } else if (code.startsWith('REKR50')) {
                        couponType = '5만원권';
                    } else {
                        continue;  // 대상 쿠폰 아님
                    }

                    // 발행일 파싱
                    const issuedDt = parseTime(v.fetched_at);

                    const coupon = {
                        email: row.email,
                        type: couponType,
                        code: code,
                        expiry: v.expiry_date || '',
                        issued: v.fetched_at || '',
                        issuedDt: issuedDt
                    };

                    if (issuedDt && issuedDt > targetDt) {
                        couponsAfter.push(coupon);
                    } else {
                        couponsBefore.push(coupon);
                    }
                }
            } catch (e) {
                continue;
            }
        }

        conn.release();

        console.log(`\n조회 결과:`);
        console.log(`  목표일 이후: ${couponsAfter.length}개`);
        console.log(`  목표일 이전 (전체): ${couponsBefore.length}개`);

        // 이후 쿠폰이 없으면 이전 쿠폰 사용
        const coupons = couponsAfter.length > 0 ? couponsAfter : couponsBefore;
        console.log(`  추출 대상: ${coupons.length}개`);

        if (coupons.length > 0) {
            // 발행일 기준 정렬
            coupons.sort((a, b) => a.issuedDt - b.issuedDt);

            // 엑셀 생성
            const data = [
                ['계정', '쿠폰종류', '쿠폰코드', '만료일자', '발행일']
            ];

            coupons.forEach(c => {
                data.push([c.email, c.type, c.code, c.expiry, c.issued]);
            });

            const workbook = XLSX.utils.book_new();
            const worksheet = XLSX.utils.aoa_to_sheet(data);

            // 컬럼 너비 설정
            worksheet['!cols'] = [
                { wch: 25 },  // 계정
                { wch: 15 },  // 쿠폰종류
                { wch: 25 },  // 쿠폰코드
                { wch: 15 },  // 만료일자
                { wch: 15 }   // 발행일
            ];

            XLSX.utils.book_append_sheet(workbook, worksheet, '쿠폰');

            // 파일 저장
            const outputDir = path.dirname(__filename);
            const timestamp = new Date().toISOString().replace(/[:\-]/g, '').slice(0, 15);
            const outputPath = path.join(outputDir, `쿠폰_조회_${timestamp}.xlsx`);

            XLSX.writeFile(workbook, outputPath);
            console.log(`\n✓ 완료! 파일: ${outputPath}`);
        } else {
            console.log('추출된 쿠폰이 없습니다.');
        }

        await pool.end();

    } catch (e) {
        console.error('✗ 오류:', e.message);
        process.exit(1);
    }
}

function parseTime(fetchedAtStr) {
    if (!fetchedAtStr) return null;
    try {
        // "[25-07-18 14:30]" -> "25-07-18 14:30"
        const cleaned = fetchedAtStr.trim().replace(/[\[\]]/g, '');
        // YY-MM-DD HH:MM 형식
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

main().catch(e => {
    console.error('Fatal error:', e);
    process.exit(1);
});
