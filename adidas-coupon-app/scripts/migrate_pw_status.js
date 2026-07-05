/**
 * 일회성 마이그레이션:
 *  - web_issue_status 에 잘못 들어간 "비밀번호 변경" 상태를 password_change_status 로 이관
 *  - 그 후 web_issue_status 는 비워서(NULL) 현황 컬럼이 최근 조회/발급 상태(web_fetch_status 등)를 보이도록 함
 *
 * 주의: 비밀번호 변경이 덮어쓴 이전 '발급' 상태는 복구 불가(덮어쓰기됨).
 *       해당 계정의 현황은 web_fetch_status(조회) 기준으로 표시됨.
 *
 * 사용법:
 *   node scripts/migrate_pw_status.js            # 점검(inspect) - 변경 없음
 *   node scripts/migrate_pw_status.js --apply    # 실제 이관 수행
 */
const { Pool } = require('pg');

const pool = new Pool({
    host: '129.212.227.252',
    port: 5433,
    database: 'shoepalace',
    user: 'shoepalace_user',
    password: 'shoepalace_pass',
});

// 비밀번호 변경 상태로 식별할 패턴 (PostgreSQL LIKE: [] 는 일반문자)
const PW_MATCH = `(
    web_issue_status LIKE '%[비밀번호 변경]%'
    OR web_issue_status LIKE '%비밀번호 변경 완료%'
    OR web_issue_status LIKE '%기존 비밀번호 틀림%'
)`;

async function inspect() {
    const counts = await pool.query(`
        SELECT
            COUNT(*) FILTER (WHERE web_issue_status LIKE '%[비밀번호 변경]%') AS marked,
            COUNT(*) FILTER (WHERE web_issue_status LIKE '%비밀번호 변경 완료%' AND web_issue_status NOT LIKE '%[비밀번호 변경]%') AS unmarked_done,
            COUNT(*) FILTER (WHERE web_issue_status LIKE '%기존 비밀번호 틀림%' AND web_issue_status NOT LIKE '%[비밀번호 변경]%') AS unmarked_pwwrong,
            COUNT(*) FILTER (WHERE ${PW_MATCH}) AS total_match,
            COUNT(*) FILTER (WHERE ${PW_MATCH} AND (password_change_status IS NULL OR password_change_status = '')) AS will_copy
        FROM adidas_accounts
    `);
    console.log('=== 점검 결과 ===');
    console.table(counts.rows[0]);

    const samples = await pool.query(`
        SELECT email, web_issue_status, password_change_status
        FROM adidas_accounts
        WHERE ${PW_MATCH}
        ORDER BY updated_at DESC NULLS LAST
        LIMIT 10
    `);
    console.log('=== 샘플 (최대 10건) ===');
    samples.rows.forEach(r => {
        console.log(` - ${r.email}`);
        console.log(`     web_issue_status     : ${r.web_issue_status}`);
        console.log(`     password_change_status: ${r.password_change_status || '(빈값)'}`);
    });
}

// 비워진 web_issue_status 를 최근 '발급(issue)' 조회이력 메시지로 복원
//  - web_fetch_status(조회)는 그대로 두고, pickLatestStatus 가 최신을 표시함
async function inspectRestore() {
    const r = await pool.query(`
        SELECT COUNT(*) AS will_restore
        FROM adidas_accounts a
        JOIN (
            SELECT DISTINCT ON (account_id) account_id
            FROM account_fetch_history
            WHERE fetch_type = 'issue'
            ORDER BY account_id, fetched_at DESC
        ) h ON a.id = h.account_id
        WHERE (a.web_issue_status IS NULL OR a.web_issue_status = '')
    `);
    console.log('=== 발급이력으로 복원 가능한 계정 ===');
    console.log(`복원 대상(현황 비어있고 발급이력 있음): ${r.rows[0].will_restore}건`);

    const samples = await pool.query(`
        SELECT a.email, h.message, h.fetched_at
        FROM adidas_accounts a
        JOIN (
            SELECT DISTINCT ON (account_id) account_id, message, fetched_at
            FROM account_fetch_history
            WHERE fetch_type = 'issue'
            ORDER BY account_id, fetched_at DESC
        ) h ON a.id = h.account_id
        WHERE (a.web_issue_status IS NULL OR a.web_issue_status = '')
        ORDER BY h.fetched_at DESC
        LIMIT 10
    `);
    console.log('=== 복원 샘플 (최대 10건) ===');
    samples.rows.forEach(r => console.log(` - ${r.email}: ${r.message}`));
}

async function applyRestore() {
    const res = await pool.query(`
        UPDATE adidas_accounts a
        SET web_issue_status = h.message
        FROM (
            SELECT DISTINCT ON (account_id) account_id, message
            FROM account_fetch_history
            WHERE fetch_type = 'issue'
            ORDER BY account_id, fetched_at DESC
        ) h
        WHERE a.id = h.account_id
          AND (a.web_issue_status IS NULL OR a.web_issue_status = '')
    `);
    console.log('=== 현황 복원 완료 ===');
    console.log(`web_issue_status 를 최근 발급이력으로 복원: ${res.rowCount}건`);
}

async function apply() {
    // 1) password_change_status 가 비어있는 경우에만 web_issue_status 값을 이관
    const copied = await pool.query(`
        UPDATE adidas_accounts
        SET password_change_status = web_issue_status
        WHERE ${PW_MATCH}
          AND (password_change_status IS NULL OR password_change_status = '')
    `);
    // 2) 비밀번호 변경 잔존 데이터가 있던 행의 web_issue_status 를 비움 → 현황은 조회/발급 기준으로
    const cleared = await pool.query(`
        UPDATE adidas_accounts
        SET web_issue_status = NULL
        WHERE ${PW_MATCH}
    `);
    console.log('=== 이관 완료 ===');
    console.log(`password_change_status 로 복사: ${copied.rowCount}건`);
    console.log(`web_issue_status 비움(현황 정리): ${cleared.rowCount}건`);
}

(async () => {
    try {
        const isApply = process.argv.includes('--apply');
        const isRestore = process.argv.includes('--restore-issue');
        if (isRestore) {
            if (isApply) await applyRestore();
            else { await inspectRestore(); console.log('\n(점검 모드입니다. 실제 복원은 --restore-issue --apply 로 실행하세요)'); }
        } else if (isApply) {
            await apply();
        } else {
            await inspect();
            await inspectRestore();
            console.log('\n(점검 모드입니다. 이관: --apply / 현황복원: --restore-issue --apply)');
        }
    } catch (e) {
        console.error('오류:', e.message);
        process.exitCode = 1;
    } finally {
        await pool.end();
    }
})();
