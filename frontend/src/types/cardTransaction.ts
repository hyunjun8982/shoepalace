export interface CardTransaction {
  id: string;
  user_id?: string;
  owner_name?: string;
  organization: string;
  client_type?: string;  // "P": 개인, "B": 법인
  card_name?: string;
  card_no?: string;
  used_date: string;
  used_time?: string;
  merchant_name?: string;
  used_amount: number;
  payment_type?: string;
  installment_month?: number;
  currency_code?: string;
  is_domestic: boolean;
  krw_amount?: number;
  approval_no?: string;
  payment_due_date?: string;
  cancel_status: string;
  cancel_amount?: number;
  vat?: number;
  service_fee?: number;
  merchant_corp_no?: string;
  merchant_type?: string;
  merchant_tel?: string;
  merchant_addr?: string;
  merchant_no?: string;
  synced_at?: string;
  created_at: string;
  updated_at: string;
}

export interface CardTransactionList {
  total: number;
  items: CardTransaction[];
}

export interface CardTransactionStats {
  total_amount: number;
  total_count: number;
  cancel_count: number;
  cancel_amount: number;
}

export interface CodefSetting {
  id: string;
  setting_key: string;
  setting_value: string;
  description?: string;
  is_encrypted: boolean;
  created_at: string;
  updated_at: string;
}

export interface CodefSettingList {
  items: CodefSetting[];
}

export interface SyncRequest {
  organization: string;
  start_date: string;
  end_date: string;
  inquiry_type?: string;
  card_no?: string;
  member_store_info_type?: string;
  client_type?: string;  // "P": 개인, "B": 법인
}

export interface SyncResponse {
  total_count: number;
  new_count: number;
  updated_count: number;
  message: string;
}

export interface CardInfo {
  card_name: string;
  card_no: string;
  card_type?: string;
  user_name?: string;
  is_sleep?: string;
  state?: string;
  image_link?: string;
}

export interface CardListResponse {
  cards: CardInfo[];
  organization: string;
}

export interface OrganizationInfo {
  code: string;
  name: string;
}

// 계정 연동
export interface AccountRegisterRequest {
  organization: string;
  login_id: string;
  password: string;
  card_no?: string;
  card_password?: string;
  client_type?: string;  // "P": 개인, "B": 법인
  business_type?: string;  // "CD": 카드, "BK": 은행
  owner_name?: string;
}

export interface AccountRegisterResponse {
  connected_id: string;
  organization: string;
  message: string;
}

export interface ConnectedAccount {
  connected_id: string;
  organization_list: string[];
}

export interface ConnectedAccountListResponse {
  accounts: ConnectedAccount[];
}

// 카드사별 계정 정보
export interface CodefAccountInfo {
  organization: string;
  organization_name: string;
  client_type: string;  // "P": 개인, "B": 법인
  login_id?: string;
  card_no?: string;
  connected_id?: string;
  owner_name?: string;
  is_connected: boolean;
  connected_at?: string;
}

export interface CodefAccountListResponse {
  accounts: CodefAccountInfo[];
}

// 카드사 코드 매핑 (프론트 표시용)
export const ORGANIZATION_MAP: Record<string, string> = {
  '0301': 'KB카드',
  '0302': '현대카드',
  '0303': '삼성카드',
  '0304': 'NH카드',
  '0305': 'BC카드',
  '0306': '신한카드',
  '0307': '씨티카드',
  '0309': '우리카드',
  '0311': '롯데카드',
  '0313': '하나카드',
  '0315': '전북카드',
  '0316': '광주카드',
  '0320': '수협카드',
  '0321': '제주카드',
};

// 카드사 홈페이지 (회원가입용)
export const CARD_SIGNUP_URLS: Record<string, string> = {
  '0301': 'https://card.kbcard.com',
  '0302': 'https://www.hyundaicard.com',
  '0303': 'https://www.samsungcard.com',
  '0304': 'https://card.nonghyup.com',
  '0305': 'https://www.bccard.com',
  '0306': 'https://www.shinhancard.com',
  '0307': 'https://www.citicard.co.kr',
  '0309': 'https://pc.wooricard.com',
  '0311': 'https://www.lottecard.co.kr',
  '0313': 'https://www.hanacard.co.kr',
  '0315': 'https://card.jbbank.co.kr',
  '0316': 'https://card.kjbank.com',
  '0320': 'https://www.suhyup-bank.com',
  '0321': 'https://www.e-jejubank.com',
};

// 결제방법 매핑
export const PAYMENT_TYPE_MAP: Record<string, string> = {
  '1': '일시불',
  '2': '할부',
  '3': '그외',
};

// 취소상태 매핑
export const CANCEL_STATUS_MAP: Record<string, string> = {
  'normal': '정상',
  'cancelled': '취소',
  'partial': '부분취소',
  'rejected': '거절',
};

// API 호출 현황
export interface ApiUsageStats {
  date: string;
  daily_count: number;
  daily_limit: number;
  remaining: number;
  last_call_at: string | null;
}
