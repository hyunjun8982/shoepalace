/**
 * 현재 보유중인 10만원 쿠폰 엑셀 추출
 *  - 조건: value=100000(10만원), 미판매(sold!=true), 미사용삭제 아님(deleted_unused!=true), 만료 안 됨
 *  - 컬럼: 발급일자 / 만료일자 / 쿠폰코드 / 계정(ID)
 *  - 정렬: 발급일자 ↑, 만료일자 ↑
 * 사용법: node scripts/export_100k_coupons.js
 */
const path = require('path');
const XLSX = require('xlsx');
const { Pool } = require('pg');

const pool = new Pool({ host:'129.212.227.252', port:5433, database:'shoepalace', user:'shoepalace_user', password:'shoepalace_pass' });

// "[26-04-30 02:36]" → {date:'2026-04-30', dt:'2026-04-30 02:36', key:'2026-04-30 02:36'}
function parseFetched(s) {
    if (!s) return { date: '', dt: '', key: '9999' };
    const m = String(s).match(/(\d{2})-(\d{2})-(\d{2})(?:\s+(\d{2}):(\d{2}))?/);
    if (!m) return { date: '', dt: '', key: '9999' };
    const y = '20' + m[1], mo = m[2], d = m[3], hh = m[4] || '00', mi = m[5] || '00';
    return { date: `${y}-${mo}-${d}`, dt: `${y}-${mo}-${d} ${hh}:${mi}`, key: `${y}-${mo}-${d} ${hh}:${mi}` };
}

function todayStr() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

(async () => {
    try {
        const today = todayStr();
        const rows = (await pool.query(
            `SELECT email, owned_vouchers FROM adidas_accounts WHERE owned_vouchers IS NOT NULL AND owned_vouchers <> ''`
        )).rows;

        const held = [];   // 현재 보유중
        const sold = [];   // 사용완료
        for (const row of rows) {
            let arr;
            try { arr = JSON.parse(row.owned_vouchers); } catch { continue; }
            if (!Array.isArray(arr)) continue;
            for (const v of arr) {
                const is100k = v.value === '100000' || v.value === 100000 || (v.name && v.name.includes('10만원'));
                if (!is100k) continue;
                if (v.deleted_unused === true) continue;    // 미사용삭제는 양쪽 모두 제외
                const exp = v.expiryDate || '';
                const f = parseFetched(v.fetched_at);

                if (v.sold === true) {
                    // 사용완료 (만료 무관하게 포함)
                    sold.push({
                        '발급일자': f.date,
                        '만료일자': exp,
                        '쿠폰코드': v.code || '',
                        '계정(ID)': row.email,
                        '판매처/메모': v.sold_to || '',
                        _sortIssue: f.key,
                        _sortExp: exp || '9999',
                    });
                } else {
                    // 현재 보유중 (만료 제외)
                    if (exp && exp < today) continue;
                    held.push({
                        '발급일자': f.date,
                        '만료일자': exp,
                        '쿠폰코드': v.code || '',
                        '계정(ID)': row.email,
                        _sortIssue: f.key,
                        _sortExp: exp || '9999',
                    });
                }
            }
        }

        // 정렬: 발급일자 ↑, 만료일자 ↑
        const bySort = (a, b) => (a._sortIssue < b._sortIssue ? -1 : a._sortIssue > b._sortIssue ? 1 : (a._sortExp < b._sortExp ? -1 : a._sortExp > b._sortExp ? 1 : 0));
        held.sort(bySort); sold.sort(bySort);
        [...held, ...sold].forEach(r => { delete r._sortIssue; delete r._sortExp; });

        const wb = XLSX.utils.book_new();

        const wsHeld = XLSX.utils.json_to_sheet(held, { header: ['발급일자', '만료일자', '쿠폰코드', '계정(ID)'] });
        wsHeld['!cols'] = [{ wch: 13 }, { wch: 13 }, { wch: 30 }, { wch: 30 }];
        XLSX.utils.book_append_sheet(wb, wsHeld, '보유중');

        const wsSold = XLSX.utils.json_to_sheet(sold, { header: ['발급일자', '만료일자', '쿠폰코드', '계정(ID)', '판매처/메모'] });
        wsSold['!cols'] = [{ wch: 13 }, { wch: 13 }, { wch: 30 }, { wch: 30 }, { wch: 24 }];
        XLSX.utils.book_append_sheet(wb, wsSold, '사용완료');

        const totalHeld = held.length;
        const totalSold = sold.length;

        const d = new Date();
        const stamp = `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}_${String(d.getHours()).padStart(2,'0')}${String(d.getMinutes()).padStart(2,'0')}`;
        const outPath = path.join(__dirname, '..', `10만원쿠폰_보유_사용완료_${stamp}.xlsx`);
        XLSX.writeFile(wb, outPath);

        console.log('=== 추출 완료 ===');
        console.log(`[보유중] ${totalHeld}건 (판매완료·미사용삭제·만료 제외, 기준일 ${today})`);
        console.log(`[사용완료] ${totalSold}건 (미사용삭제 제외, 만료 무관)`);
        console.log(`파일: ${path.resolve(outPath)}`);
    } catch (e) {
        console.error('오류:', e.message);
        process.exitCode = 1;
    } finally {
        await pool.end();
    }
})();
