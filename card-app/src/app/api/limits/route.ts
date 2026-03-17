import { NextRequest } from 'next/server';
import { queryAll, query, queryOne } from '@/lib/db';
import { getUser, unauthorized } from '@/lib/auth';
import { getCardLimit, getCardList } from '@/lib/codef';

const CORP_TOTAL_LIMIT_ORGS = ['0301', '0304', '0306', '0309', '0311', '0313', '0321'];

// 개인 로그인으로 법인 한도도 조회 가능한 카드사
const CROSS_TYPE_ORGS = ['0303']; // 삼성카드

// GET: DB에서 저장된 한도 조회
export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return unauthorized();

  try {
    const isAdmin = user.role === 'super_admin';
    const rows = isAdmin
      ? await queryAll(`SELECT DISTINCT ON (organization, client_type) organization, client_type, owner_name, total_limit, used_limit, remaining_limit, one_time_limit, installment_limit, cash_advance_limit, card_company, error, fetched_at FROM card_limits ORDER BY organization, client_type, fetched_at DESC NULLS LAST`)
      : await queryAll('SELECT organization, client_type, owner_name, total_limit, used_limit, remaining_limit, one_time_limit, installment_limit, cash_advance_limit, card_company, error, fetched_at FROM card_limits WHERE user_id = $1 ORDER BY organization', [user.userId]);

    const lastFetchedAt = rows.length > 0
      ? rows.reduce((max, r) => r.fetched_at > max ? r.fetched_at : max, rows[0].fetched_at)
      : null;

    return Response.json({
      cards: rows.map(r => ({
        ...r,
        total_limit: r.total_limit != null ? Number(r.total_limit) : null,
        used_limit: r.used_limit != null ? Number(r.used_limit) : null,
        remaining_limit: r.remaining_limit != null ? Number(r.remaining_limit) : null,
        one_time_limit: r.one_time_limit != null ? Number(r.one_time_limit) : null,
        installment_limit: r.installment_limit != null ? Number(r.installment_limit) : null,
        cash_advance_limit: r.cash_advance_limit != null ? Number(r.cash_advance_limit) : null,
      })),
      fetched_at: lastFetchedAt,
    });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}

// POST: CODEF API 호출 후 DB에 저장
// body: { organization?, client_type? } - 지정 시 해당 카드사만 갱신
export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return unauthorized();

  try {
    let body: any = {};
    try { body = await req.json(); } catch {}
    const targetOrg = body.organization;
    const targetType = body.client_type;

    const isAdmin = user.role === 'super_admin';
    let accountQuery = "SELECT organization, client_type, connected_id, owner_name, first_card_no, card_no FROM codef_accounts WHERE connected_id IS NOT NULL AND connected_id != '' AND is_connected = true AND organization LIKE '03%'";
    const params: any[] = [];

    if (!isAdmin) {
      params.push(user.userId);
      accountQuery += ` AND card_app_user_id = $${params.length}`;
    }
    if (targetOrg) {
      params.push(targetOrg);
      accountQuery += ` AND organization = $${params.length}`;
    }
    if (targetType) {
      params.push(targetType);
      accountQuery += ` AND client_type = $${params.length}`;
    }
    accountQuery += ' ORDER BY organization';

    const accounts = await queryAll(accountQuery, params);
    const results: any[] = [];
    const parseAmt = (v: any) => v ? parseFloat(String(v).replace(/,/g, '')) || null : null;

    for (const acc of accounts) {
      try {
        // 한도 API 직접 호출
        // 법인 총한도 지원 카드사: inquiryType=1, 그 외: inquiryType=0 + cardNo 필요
        let cardNoForLimit = acc.first_card_no || acc.card_no || '';

        // 카드번호가 없고 총한도 조회 미지원 카드사면 → 카드목록에서 자동 조회
        if (!cardNoForLimit && !CORP_TOTAL_LIMIT_ORGS.includes(acc.organization)) {
          try {
            const cards = await getCardList(acc.organization, acc.connected_id, acc.client_type);
            const activeCard = cards.find((c: any) => c.resSleepYN !== 'Y' && c.resState !== '분실');
            if (activeCard) {
              cardNoForLimit = activeCard.resCardNo || '';
              // DB에 first_card_no 저장
              if (cardNoForLimit) {
                await query('UPDATE codef_accounts SET first_card_no = $1 WHERE organization = $2 AND connected_id = $3 AND client_type = $4 AND first_card_no IS NULL',
                  [cardNoForLimit, acc.organization, acc.connected_id, acc.client_type]);
              }
            }
          } catch {}
        }

        const limitInfo = await getCardLimit(acc.organization, acc.connected_id, cardNoForLimit, acc.client_type);

        let limitData: any;
        if (Array.isArray(limitInfo)) {
          limitData = limitInfo[0];
        } else {
          limitData = limitInfo;
        }

        const totalList = limitData?.resLimitOfTotalList?.[0];
        const fullTotalList = limitData?.resLimitOfFullTotalList?.[0];
        const installmentList = limitData?.resLimitOfInstallmentList?.[0];
        const shortLoanList = limitData?.resLimitOfShortLoanList?.[0];

        const totalLimitAmt = parseAmt(totalList?.resLimitAmount) ?? parseAmt(limitData?.resLimitAmount);
        const usedAmt = parseAmt(totalList?.resUsedAmount) ?? parseAmt(limitData?.resUsedAmount);
        const remainAmt = parseAmt(totalList?.resRemainLimit) ?? parseAmt(limitData?.resRemainLimit);

        const item: any = {
          organization: acc.organization,
          client_type: acc.client_type,
          owner_name: acc.owner_name || '',
          total_limit: totalLimitAmt,
          used_limit: usedAmt ?? (totalLimitAmt != null && remainAmt != null ? totalLimitAmt - remainAmt : null),
          remaining_limit: remainAmt,
          one_time_limit: parseAmt(fullTotalList?.resLimitAmount),
          installment_limit: parseAmt(installmentList?.resLimitAmount),
          cash_advance_limit: parseAmt(shortLoanList?.resLimitAmount),
          card_company: limitData?.resCardCompany || null,
        };

        // 개별 카드사 조회 시 raw 응답 포함 (디버그용)
        if (targetOrg) {
          item.raw = limitData;
        }

        await upsertLimit(user.userId, item);
        results.push(item);

        // 삼성카드 등: 개인 로그인으로 법인카드 한도도 조회 시도
        // 개인 경로(/p/)에서 카드 목록 조회 → 법인카드 찾으면 개인 경로로 한도 조회
        if (acc.client_type === 'P' && CROSS_TYPE_ORGS.includes(acc.organization)) {
          try {
            // 개인 경로로 카드 목록 조회 (법인카드도 포함될 수 있음)
            const allCards = await getCardList(acc.organization, acc.connected_id, 'P');
            // 법인카드 필터: resCardType에 '법인' 포함 + 분실/정지 카드 제외
            const corpCards = allCards.filter((c: any) =>
              (c.resCardType && c.resCardType.includes('법인')) &&
              c.resSleepYN !== 'Y' && c.resState !== '분실'
            );

            if (corpCards.length > 0) {
              // 법인카드 중 첫 번째로 한도 조회 (법인 경로 사용)
              const firstCorpCard = corpCards[0];
              const corpCardNo = firstCorpCard.resCardNo || firstCorpCard.card_no || '';
              // 법인 경로(/b/)로 한도 조회 - 개인 connected_id로 법인카드 한도 조회 시도
              const corpLimit = await getCardLimit(acc.organization, acc.connected_id, corpCardNo, 'B');

              let corpLimitData: any;
              if (Array.isArray(corpLimit)) {
                corpLimitData = corpLimit[0];
              } else {
                corpLimitData = corpLimit;
              }

              const cTotalList = corpLimitData?.resLimitOfTotalList?.[0];
              const cFullTotalList = corpLimitData?.resLimitOfFullTotalList?.[0];
              const cInstallmentList = corpLimitData?.resLimitOfInstallmentList?.[0];
              const cShortLoanList = corpLimitData?.resLimitOfShortLoanList?.[0];

              const cTotalLimitAmt = parseAmt(cTotalList?.resLimitAmount) ?? parseAmt(corpLimitData?.resLimitAmount);
              const cUsedAmt = parseAmt(cTotalList?.resUsedAmount) ?? parseAmt(corpLimitData?.resUsedAmount);
              const cRemainAmt = parseAmt(cTotalList?.resRemainLimit) ?? parseAmt(corpLimitData?.resRemainLimit);

              const corpItem: any = {
                organization: acc.organization,
                client_type: 'B',
                owner_name: firstCorpCard.resUserNm || acc.owner_name || '',
                total_limit: cTotalLimitAmt,
                used_limit: cUsedAmt ?? (cTotalLimitAmt != null && cRemainAmt != null ? cTotalLimitAmt - cRemainAmt : null),
                remaining_limit: cRemainAmt,
                one_time_limit: parseAmt(cFullTotalList?.resLimitAmount),
                installment_limit: parseAmt(cInstallmentList?.resLimitAmount),
                cash_advance_limit: parseAmt(cShortLoanList?.resLimitAmount),
              };

              if (targetOrg) {
                corpItem.raw = corpLimitData;
                corpItem.corpCards = corpCards; // 디버그: 법인카드 목록
              }

              await upsertLimit(user.userId, corpItem);
              results.push(corpItem);
            } else if (targetOrg) {
              // 디버그: 법인카드를 못 찾았을 때 전체 카드 목록 반환
              results.push({
                organization: acc.organization,
                client_type: 'B',
                owner_name: acc.owner_name || '',
                error: '법인카드 미발견',
                _debug_allCards: allCards,
              });
            }
          } catch {
            // 법인 한도 조회 실패 시 무시 (개인 한도만 표시)
          }
        }
      } catch (err: any) {
        const item: any = { organization: acc.organization, client_type: acc.client_type, owner_name: acc.owner_name || '', error: err.message };
        if (targetOrg) {
          item.connected_id = acc.connected_id;
          item.first_card_no = acc.first_card_no;
        }
        // 에러 시 error 컬럼만 업데이트, 기존 한도 데이터 보존
        await upsertLimitError(user.userId, item);
        results.push(item);
      }
    }

    return Response.json({ cards: results, fetched_at: new Date().toISOString() });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}

async function upsertLimit(userId: number, item: any) {
  await query(
    `INSERT INTO card_limits (user_id, organization, client_type, owner_name, total_limit, used_limit, remaining_limit, one_time_limit, installment_limit, cash_advance_limit, card_company, error, fetched_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW(), NOW())
     ON CONFLICT (user_id, organization, client_type) DO UPDATE SET
       owner_name = $4, total_limit = $5, used_limit = $6, remaining_limit = $7,
       one_time_limit = $8, installment_limit = $9, cash_advance_limit = $10,
       card_company = COALESCE($11, card_limits.card_company),
       error = NULL, fetched_at = NOW(), updated_at = NOW()`,
    [
      userId, item.organization, item.client_type, item.owner_name || null,
      item.total_limit ?? null, item.used_limit ?? null, item.remaining_limit ?? null,
      item.one_time_limit ?? null, item.installment_limit ?? null, item.cash_advance_limit ?? null,
      item.card_company || null, item.error || null,
    ]
  );
}

async function upsertLimitError(userId: number, item: any) {
  await query(
    `INSERT INTO card_limits (user_id, organization, client_type, owner_name, error, fetched_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
     ON CONFLICT (user_id, organization, client_type) DO UPDATE SET
       error = $5, updated_at = NOW()`,
    [userId, item.organization, item.client_type, item.owner_name || null, item.error || null]
  );
}
