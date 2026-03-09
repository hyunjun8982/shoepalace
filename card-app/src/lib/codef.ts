import { queryOne, queryAll, query } from './db';
import forge from 'node-forge';

// 캐시된 토큰
let cachedToken: { token: string; expiresAt: number } | null = null;

async function getSetting(key: string): Promise<string> {
  const row = await queryOne('SELECT setting_value FROM codef_settings WHERE setting_key = $1', [key]);
  return row?.setting_value || '';
}

async function getAllSettings(): Promise<Record<string, string>> {
  const rows = await queryAll('SELECT setting_key, setting_value FROM codef_settings');
  const settings: Record<string, string> = {};
  for (const row of rows) settings[row.setting_key] = row.setting_value;
  return settings;
}

async function getBaseUrl(): Promise<string> {
  const useDemo = await getSetting('use_demo');
  return useDemo === 'true' ? 'https://development.codef.io' : 'https://api.codef.io';
}

export async function getAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt) return cachedToken.token;

  const clientId = await getSetting('client_id');
  const clientSecret = await getSetting('client_secret');
  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

  const res = await fetch('https://oauth.codef.io/oauth/token', {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials&scope=read',
  });

  const data = await res.json();
  cachedToken = { token: data.access_token, expiresAt: Date.now() + 3500 * 1000 };
  return data.access_token;
}

export function encryptRSA(text: string, publicKeyRaw: string): string {
  // DB에 PEM 헤더 없이 raw base64로 저장된 경우 PEM 형식으로 변환
  let pem = publicKeyRaw.trim();
  if (!pem.startsWith('-----BEGIN')) {
    pem = `-----BEGIN PUBLIC KEY-----\n${pem}\n-----END PUBLIC KEY-----`;
  }
  const key = forge.pki.publicKeyFromPem(pem);
  const encrypted = key.encrypt(text, 'RSAES-PKCS1-V1_5');
  return forge.util.encode64(encrypted);
}

async function logApiCall(endpoint: string, statusCode?: number, resCode?: string, errorMessage?: string) {
  await query(
    'INSERT INTO codef_api_logs (id, endpoint, status_code, res_code, error_message, created_at, updated_at) VALUES (gen_random_uuid(), $1, $2, $3, $4, NOW(), NOW())',
    [endpoint, statusCode, resCode, errorMessage]
  );
}

async function checkDailyLimit() {
  const settings = await getAllSettings();
  if (settings.use_demo !== 'true') return;

  const count = await queryOne(
    "SELECT COUNT(*) as cnt FROM codef_api_logs WHERE created_at >= CURRENT_DATE AND created_at < CURRENT_DATE + INTERVAL '1 day'"
  );
  if (parseInt(count.cnt) >= 100) {
    throw new Error('CODEF 데모 서버 일일 호출 한도(100건)를 초과했습니다');
  }
}

async function parseCodefResponse(res: Response): Promise<any> {
  const text = await res.text();
  let parsed: any;
  try {
    parsed = JSON.parse(text);
  } catch {
    // CODEF API가 URL-encoded JSON을 반환하는 경우
    try {
      parsed = JSON.parse(decodeURIComponent(text));
    } catch {
      throw new Error(`CODEF API 응답 파싱 실패: ${text.slice(0, 200)}`);
    }
  }
  // 최상위가 문자열인 경우 한 번 더 디코딩
  if (typeof parsed === 'string') {
    try { parsed = JSON.parse(decodeURIComponent(parsed)); } catch {}
  }
  return parsed;
}

export async function callCodefApi(endpoint: string, params: Record<string, any>): Promise<any> {
  await checkDailyLimit();

  const token = await getAccessToken();
  const baseUrl = await getBaseUrl();
  const url = `${baseUrl}${endpoint}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(params),
  });

  const data = await parseCodefResponse(res);

  let result = data.result || {};
  let parsedData = data.data;
  if (typeof parsedData === 'string') {
    try { parsedData = JSON.parse(decodeURIComponent(parsedData)); } catch {}
  }

  const resCode = result.code || '';
  await logApiCall(endpoint, res.status, resCode, resCode !== 'CF-00000' ? result.message : undefined);

  if (resCode !== 'CF-00000') {
    throw new Error(result.message || `CODEF API 오류: ${resCode}`);
  }

  return parsedData;
}

// callCodefApi와 동일하지만 에러를 throw하지 않고 resCode를 포함해 반환
async function callCodefApiRaw(endpoint: string, params: Record<string, any>): Promise<{ resCode: string; data: any; message: string }> {
  await checkDailyLimit();

  const token = await getAccessToken();
  const baseUrl = await getBaseUrl();
  const url = `${baseUrl}${endpoint}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(params),
  });

  const raw = await parseCodefResponse(res);
  let result = raw.result || {};
  let parsedData = raw.data;
  if (typeof parsedData === 'string') {
    try { parsedData = JSON.parse(decodeURIComponent(parsedData)); } catch {}
  }

  const resCode = result.code || '';
  const message = result.message ? decodeURIComponent(result.message) : '';
  await logApiCall(endpoint, res.status, resCode, resCode !== 'CF-00000' ? message : undefined);

  console.log(`[CODEF API] ${endpoint} → ${resCode}: ${message}`);
  if (resCode !== 'CF-00000') {
    console.log(`[CODEF API] Error data:`, JSON.stringify(parsedData, null, 2));
  }

  return { resCode, data: parsedData || {}, message };
}

// 카드 목록 조회
export async function getCardList(organization: string, connectedId: string, clientType: string = 'P'): Promise<any[]> {
  const path = clientType === 'B' ? 'b' : 'p';
  const data = await callCodefApi(`/v1/kr/card/${path}/account/card-list`, {
    connectedId,
    organization,
    inquiryType: '0',
  });
  return Array.isArray(data) ? data : (data?.resCardList || []);
}

// 법인 총한도(inquiryType=1) 지원 카드사: KB, NH, 신한, 우리, 롯데, 하나, 제주
const CORP_TOTAL_LIMIT_ORGS = ['0301', '0304', '0306', '0309', '0311', '0313', '0321'];

// 카드 한도 조회
export async function getCardLimit(organization: string, connectedId: string, cardNo: string, clientType: string = 'P'): Promise<any> {
  const path = clientType === 'B' ? 'b' : 'p';
  const params: Record<string, any> = { connectedId, organization };

  if (clientType === 'B' && CORP_TOTAL_LIMIT_ORGS.includes(organization)) {
    // 법인 총한도 조회 (cardNo 불필요)
    params.inquiryType = '1';
  } else {
    // 개인 또는 법인 카드별 조회
    params.inquiryType = '0';
    params.cardNo = cardNo;
  }

  const data = await callCodefApi(`/v1/kr/card/${path}/account/limit`, params);
  return data;
}

// 승인내역 조회 (DB 저장 안 함)
export async function fetchApprovalList(
  organization: string, connectedId: string,
  startDate: string, endDate: string,
  clientType: string = 'P', cardNo?: string,
  memberStoreInfoType: string = '3', inquiryType: string = '1'
): Promise<any[]> {
  const path = clientType === 'B' ? 'b' : 'p';
  const params: Record<string, any> = {
    connectedId,
    organization,
    startDate: startDate.replace(/-/g, ''),
    endDate: endDate.replace(/-/g, ''),
    orderBy: '0',
    inquiryType,
    memberStoreInfoType,
  };
  if (cardNo) params.cardNo = cardNo;

  const data = await callCodefApi(`/v1/kr/card/${path}/account/approval-list`, params);
  return Array.isArray(data) ? data : [];
}

function parseAmount(val: any): number | null {
  if (!val) return null;
  const s = String(val).replace(/,/g, '');
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

function parseDate(val: string): string | null {
  if (!val || val.length !== 8) return null;
  return `${val.slice(0, 4)}-${val.slice(4, 6)}-${val.slice(6, 8)}`;
}

function parseCancelStatus(val: string): string {
  const map: Record<string, string> = { '0': 'normal', '1': 'cancelled', '2': 'partial', '3': 'rejected' };
  return map[val] || 'normal';
}

// 승인내역 동기화 (DB 저장)
export async function syncApprovalList(
  organization: string, connectedId: string,
  startDate: string, endDate: string,
  clientType: string = 'P', ownerName?: string,
  cardNo?: string, memberStoreInfoType: string = '3', inquiryType: string = '1'
): Promise<{ total_count: number; new_count: number; updated_count: number }> {
  const rawList = await fetchApprovalList(organization, connectedId, startDate, endDate, clientType, cardNo, memberStoreInfoType, inquiryType);

  let newCount = 0, updatedCount = 0;

  for (const item of rawList) {
    const usedDate = parseDate(item.resUsedDate);
    const approvalNo = item.resApprovalNo || '';
    const itemCardNo = item.resCardNo || '';

    if (!usedDate) continue;

    // upsert by unique key (organization, approval_no, used_date, card_no)
    const existing = await queryOne(
      'SELECT id FROM card_transactions WHERE organization = $1 AND approval_no = $2 AND used_date = $3 AND card_no = $4',
      [organization, approvalNo, usedDate, itemCardNo]
    );

    const values = {
      organization,
      client_type: clientType,
      card_name: item.resCardName || null,
      card_no: itemCardNo,
      used_date: usedDate,
      used_time: item.resUsedTime || null,
      merchant_name: item.resMemberStoreName || null,
      used_amount: parseAmount(item.resUsedAmount) || 0,
      payment_type: item.resInstallmentCount === '00' || item.resInstallmentCount === '1' ? '1' : (parseInt(item.resInstallmentCount || '0') > 1 ? '2' : '3'),
      installment_month: parseInt(item.resInstallmentCount || '0') || null,
      currency_code: item.resCurrencyCode || 'KRW',
      is_domestic: (item.resKRWAmount || '') === '',
      krw_amount: parseAmount(item.resKRWAmount),
      approval_no: approvalNo,
      payment_due_date: item.resPaymentDueDate || null,
      cancel_status: parseCancelStatus(item.resCancelYN || '0'),
      cancel_amount: parseAmount(item.resCancelAmount),
      vat: parseAmount(item.resVAT),
      service_fee: parseAmount(item.resServiceFee),
      merchant_corp_no: item.resMemberCorpNo || null,
      merchant_type: item.resMemberType || null,
      merchant_tel: item.resMemberTelNo || null,
      merchant_addr: item.resMemberAddr || null,
      merchant_no: item.resMemberNo || null,
      owner_name: ownerName || null,
    };

    if (existing) {
      const setClauses = Object.keys(values).map((k, i) => `${k} = $${i + 1}`).join(', ');
      await query(
        `UPDATE card_transactions SET ${setClauses}, synced_at = NOW(), updated_at = NOW() WHERE id = $${Object.keys(values).length + 1}`,
        [...Object.values(values), existing.id]
      );
      updatedCount++;
    } else {
      const cols = Object.keys(values).join(', ');
      const placeholders = Object.keys(values).map((_, i) => `$${i + 1}`).join(', ');
      await query(
        `INSERT INTO card_transactions (id, ${cols}, synced_at, created_at, updated_at) VALUES (gen_random_uuid(), ${placeholders}, NOW(), NOW(), NOW())`,
        Object.values(values)
      );
      newCount++;
    }
  }

  return { total_count: rawList.length, new_count: newCount, updated_count: updatedCount };
}

// 계정 등록/추가
export async function registerAccount(
  organization: string, loginId: string, password: string,
  opts: {
    cardNo?: string; cardPassword?: string;
    clientType?: string; businessType?: string;
    accountNo?: string; ownerName?: string;
    cardAppUserId?: number;
    loginType?: string;       // '0'=공인인증서, '1'=아이디/비밀번호
    certId?: string;          // 인증서 ID (user_certificates.id)
    certPassword?: string;    // 인증서 비밀번호 (평문)
  } = {}
): Promise<{ connectedId: string; action: string }> {
  const { cardNo, cardPassword, clientType = 'P', businessType = 'CD', accountNo, ownerName, cardAppUserId, loginType = '1', certId, certPassword } = opts;
  const settings = await getAllSettings();
  const publicKey = settings.public_key;
  if (!publicKey) throw new Error('CODEF 공개키가 설정되지 않았습니다');

  const accountInfo: Record<string, any> = {
    countryCode: 'KR',
    businessType,
    clientType,
    organization,
    loginType,
  };

  if (loginType === '0') {
    // 공인인증서 로그인
    if (!certId || !certPassword) throw new Error('인증서 ID와 인증서 비밀번호가 필요합니다');
    const cert = await queryOne('SELECT der_file, key_file, cert_name FROM user_certificates WHERE id = $1', [certId]);
    if (!cert) throw new Error('등록된 인증서를 찾을 수 없습니다');
    accountInfo.certType = '1';
    accountInfo.derFile = cert.der_file;
    accountInfo.keyFile = cert.key_file;
    accountInfo.password = encryptRSA(certPassword, publicKey);
    // loginId가 없으면 cert_name 사용 (UI 표시용)
    loginId = loginId || cert.cert_name || certId;
  } else {
    // 아이디/비밀번호 로그인
    const encPassword = encryptRSA(password, publicKey);
    accountInfo.id = loginId;
    accountInfo.password = encPassword;
    if (cardNo) accountInfo.cardNo = cardNo;
    if (cardPassword) accountInfo.cardPassword = encryptRSA(cardPassword, publicKey);
  }

  if (!cardAppUserId) throw new Error('사용자 정보를 찾을 수 없습니다');

  // codef_accounts 컬럼 확보 (SELECT 전에 실행)
  await query(`ALTER TABLE codef_accounts ADD COLUMN IF NOT EXISTS login_type VARCHAR(1) DEFAULT '1'`);
  await query(`ALTER TABLE codef_accounts ADD COLUMN IF NOT EXISTS cert_id UUID`);

  // 기존 connected_id 조회 - loginType별로 분리 (인증서/아이디 혼용 방지)
  const existing = await queryOne(
    'SELECT connected_id FROM codef_accounts WHERE card_app_user_id = $1 AND client_type = $2 AND login_type = $3 AND connected_id IS NOT NULL LIMIT 1',
    [cardAppUserId, clientType, loginType]
  );
  let connectedId = existing?.connected_id || '';

  let endpoint: string;
  let params: Record<string, any>;

  if (connectedId) {
    endpoint = '/v1/account/add';
    params = { connectedId, accountList: [accountInfo] };
  } else {
    endpoint = '/v1/account/create';
    params = { accountList: [accountInfo] };
  }

  let result = await callCodefApiRaw(endpoint, params);

  // CF-04019: 존재하지 않는 connectedId → create로 재시도
  if (result.resCode === 'CF-04019' && connectedId) {
    await query('UPDATE codef_accounts SET connected_id = NULL, is_connected = false WHERE connected_id = $1', [connectedId]);
    connectedId = '';
    result = await callCodefApiRaw('/v1/account/create', { accountList: [accountInfo] });
  }

  // CF-04000: 등록 실패 → errorList 분석
  if (result.resCode === 'CF-04000') {
    const errorList = result.data?.errorList || (Array.isArray(result.data) ? result.data : []);
    const hasDuplicate = errorList.some((e: any) => e.code === 'CF-04004');
    const hasUnsupportedLoginType = errorList.some((e: any) => e.code === 'CF-11021');
    console.log(`[CODEF] CF-04000 errorList:`, JSON.stringify(errorList), `hasDuplicate:`, hasDuplicate);

    if (hasUnsupportedLoginType) {
      throw new Error(`공인인증서 로그인 파라미터 오류입니다. 인증서 정보와 기관 코드를 확인해주세요. (CF-11021)`);
    }
    // CF-04004 중복이거나, errorList가 비어있으면 update 재시도
    if (connectedId && (hasDuplicate || errorList.length === 0)) {
      result = await callCodefApiRaw('/v1/account/update', { connectedId, accountList: [accountInfo] });
    }
  }

  if (result.resCode !== 'CF-00000') {
    // errorList에서 상세 메시지 추출
    const errorList = result.data?.errorList || (Array.isArray(result.data) ? result.data : []);
    const details = errorList
      .map((e: any) => {
        const extra = e.extraMessage ? decodeURIComponent(e.extraMessage.replace(/\+/g, ' ')) : '';
        const msg = e.message ? decodeURIComponent(e.message.replace(/\+/g, ' ')) : '';
        return extra || msg;
      })
      .filter(Boolean)
      .join('; ');
    const baseMsg = result.message || `계정 등록 실패: ${result.resCode}`;
    throw new Error(details ? `${baseMsg} (${details})` : baseMsg);
  }

  // connectedId 추출: data가 객체일 수도, 배열일 수도 있음
  let newConnectedId = '';
  if (result.data?.connectedId) {
    newConnectedId = result.data.connectedId;
  } else if (Array.isArray(result.data) && result.data[0]?.connectedId) {
    newConnectedId = result.data[0].connectedId;
  } else {
    newConnectedId = connectedId;
  }
  console.log(`[CODEF] connectedId resolved: "${newConnectedId}", from data:`, JSON.stringify(result.data));

  // DB에 저장 (card_app_user_id 기준)
  const existingAcc = await queryOne(
    'SELECT id FROM codef_accounts WHERE card_app_user_id = $1 AND organization = $2 AND client_type = $3 LIMIT 1',
    [cardAppUserId, organization, clientType]
  );

  if (existingAcc) {
    await query(
      `UPDATE codef_accounts SET login_id = $1, connected_id = $2, is_connected = true, owner_name = $3, account_no = $4, card_no = $5, login_type = $6, cert_id = $7, connected_at = NOW(), updated_at = NOW() WHERE id = $8`,
      [loginId, newConnectedId, ownerName || '', accountNo || '', cardNo || '', loginType, certId || null, existingAcc.id]
    );
  } else {
    await query(
      `INSERT INTO codef_accounts (card_app_user_id, organization, client_type, login_id, connected_id, is_connected, owner_name, account_no, card_no, login_type, cert_id, connected_at)
       VALUES ($1, $2, $3, $4, $5, true, $6, $7, $8, $9, $10, NOW())`,
      [cardAppUserId, organization, clientType, loginId, newConnectedId, ownerName || '', accountNo || '', cardNo || '', loginType, certId || null]
    );
  }

  const action = connectedId ? '추가' : '생성';
  return { connectedId: newConnectedId, action };
}

// ==============================
// 은행 수시입출 거래내역 동기화
// ==============================

export async function fetchBankTransactionList(
  organization: string, connectedId: string, accountNo: string,
  startDate: string, endDate: string, clientType: string = 'B'
): Promise<{ items: any[]; accountInfo: Record<string, string> }> {
  const pathType = clientType === 'B' ? 'b' : 'p';

  const data = await callCodefApi(`/v1/kr/bank/${pathType}/account/transaction-list`, {
    organization,
    connectedId,
    account: accountNo,
    startDate: startDate.replace(/-/g, ''),
    endDate: endDate.replace(/-/g, ''),
    orderBy: '0',
    inquiryType: '1',
  });

  const items = data?.resTrHistoryList || [];
  const accountInfo = {
    account_no: data?.resAccount || accountNo,
    account_name: data?.resAccountName || '',
    account_holder: data?.resAccountHolder || '',
  };

  return { items, accountInfo };
}

export async function syncBankTransactions(
  organization: string, connectedId: string, accountNo: string,
  startDate: string, endDate: string,
  clientType: string = 'B', ownerName?: string,
): Promise<{ total_count: number; new_count: number; updated_count: number }> {
  const { items, accountInfo } = await fetchBankTransactionList(
    organization, connectedId, accountNo, startDate, endDate, clientType
  );

  let newCount = 0;
  let updatedCount = 0;

  for (const item of items) {
    const trDateRaw = item.resAccountTrDate || '';
    const trDate = parseDate(trDateRaw);
    if (!trDate) continue;

    const trTime = item.resAccountTrTime || '';
    const amountOut = parseAmount(item.resAccountOut) || 0;
    const amountIn = parseAmount(item.resAccountIn) || 0;
    const balance = parseAmount(item.resAfterTranBalance) || 0;
    const acctNo = accountInfo.account_no || accountNo;

    // Check existing
    const existing = await queryOne(
      `SELECT id FROM bank_transactions WHERE organization = $1 AND account_no = $2 AND tr_date = $3 AND tr_time = $4 AND tr_amount_out = $5 AND tr_amount_in = $6 AND balance = $7`,
      [organization, acctNo, trDate, trTime, amountOut, amountIn, balance]
    );

    if (existing) {
      await query(
        `UPDATE bank_transactions SET description1 = $1, description2 = $2, description3 = $3, description4 = $4, account_name = $5, account_holder = $6, owner_name = $7, client_type = $8, synced_at = NOW(), updated_at = NOW() WHERE id = $9`,
        [
          item.resAccountDesc1 || '', item.resAccountDesc2 || '',
          item.resAccountDesc3 || '', item.resAccountDesc4 || '',
          accountInfo.account_name, accountInfo.account_holder,
          ownerName || '', clientType, existing.id,
        ]
      );
      updatedCount++;
    } else {
      await query(
        `INSERT INTO bank_transactions (organization, account_no, account_name, account_holder, tr_date, tr_time, description1, description2, description3, description4, tr_amount_out, tr_amount_in, balance, currency, owner_name, client_type, synced_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, NOW())`,
        [
          organization, acctNo, accountInfo.account_name, accountInfo.account_holder,
          trDate, trTime,
          item.resAccountDesc1 || '', item.resAccountDesc2 || '',
          item.resAccountDesc3 || '', item.resAccountDesc4 || '',
          amountOut, amountIn, balance, 'KRW', ownerName || '', clientType,
        ]
      );
      newCount++;
    }
  }

  return { total_count: items.length, new_count: newCount, updated_count: updatedCount };
}
