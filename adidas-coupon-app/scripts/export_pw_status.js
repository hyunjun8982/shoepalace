/**
 * 비밀번호 변경 상태 엑셀 추출
 *  - 컬럼: ID(이메일) / 비밀번호 / 비밀번호 변경 상태
 *  - 상태 분류: 변경완료 / 로그인차단 / 비밀번호 틀림 / 기타(실패·진행중)
 *  - 분류별 시트 + 전체(정렬) 시트 생성. 미실행(상태 없음)은 제외.
 *
 * 사용법: node scripts/export_pw_status.js
 */
const path = require('path');
const XLSX = require('xlsx');
const { Pool } = require('pg');

const pool = new Pool({
    host: '129.212.227.252',
    port: 5433,
    database: 'shoepalace',
    user: 'shoepalace_user',
    password: 'shoepalace_pass',
});

function classify(raw) {
    const s = raw || '';
    if (!s.trim()) return null; // 미실행 → 제외
    if (s.includes('완료')) return '변경완료';
    if (s.includes('차단')) return '로그인차단';
    if (s.includes('기존 비밀번호 틀림') || s.includes('비밀번호 틀림')) return '비밀번호 틀림';
    if (s.includes('중...')) return '기타'; // 진행중
    return '기타'; // 토큰실패/API실패/중지/알수없음 등
}

// 시트 순서
const ORDER = ['변경완료', '로그인차단', '비밀번호 틀림', '기타'];

(async () => {
    try {
        const rows = (await pool.query(
            `SELECT email, password, name, phone, password_change_status
             FROM adidas_accounts
             ORDER BY email`
        )).rows;

        const groups = { '변경완료': [], '로그인차단': [], '비밀번호 틀림': [], '기타': [] };
        for (const r of rows) {
            const cat = classify(r.password_change_status);
            if (!cat) continue;
            groups[cat].push({
                'ID': r.email,
                '비밀번호': r.password,
                '이름': r.name || '',
                '전화번호': r.phone || '',
                '비밀번호 변경 상태': cat,
            });
        }

        const wb = XLSX.utils.book_new();

        // 분류별 시트 (데이터 있는 것만)
        for (const cat of ORDER) {
            if (groups[cat].length === 0) continue;
            const ws = XLSX.utils.json_to_sheet(groups[cat], { header: ['ID', '비밀번호', '이름', '전화번호', '비밀번호 변경 상태'] });
            ws['!cols'] = [{ wch: 34 }, { wch: 20 }, { wch: 12 }, { wch: 16 }, { wch: 16 }];
            XLSX.utils.book_append_sheet(wb, ws, cat);
        }

        // 전체(상태별 정렬) 시트
        const all = [];
        for (const cat of ORDER) all.push(...groups[cat]);
        if (all.length > 0) {
            const wsAll = XLSX.utils.json_to_sheet(all, { header: ['ID', '비밀번호', '이름', '전화번호', '비밀번호 변경 상태'] });
            wsAll['!cols'] = [{ wch: 34 }, { wch: 20 }, { wch: 12 }, { wch: 16 }, { wch: 16 }];
            XLSX.utils.book_append_sheet(wb, wsAll, '전체(정렬)');
        }

        const d = new Date();
        const stamp = `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}_${String(d.getHours()).padStart(2,'0')}${String(d.getMinutes()).padStart(2,'0')}`;
        const outPath = path.join(__dirname, '..', `비밀번호변경_상태_${stamp}.xlsx`);
        XLSX.writeFile(wb, outPath);

        console.log('=== 추출 완료 ===');
        for (const cat of ORDER) console.log(`  ${cat}: ${groups[cat].length}건`);
        console.log(`  합계: ${all.length}건 (미실행 제외)`);
        console.log(`파일: ${path.resolve(outPath)}`);
    } catch (e) {
        console.error('오류:', e.message);
        process.exitCode = 1;
    } finally {
        await pool.end();
    }
})();
