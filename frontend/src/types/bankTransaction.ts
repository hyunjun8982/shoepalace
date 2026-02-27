export interface BankTransaction {
  id: string;
  user_id?: string;
  owner_name?: string;
  organization: string;
  account_no?: string;
  account_name?: string;
  account_holder?: string;
  tr_date: string;
  tr_time?: string;
  description1?: string;
  description2?: string;
  description3?: string;
  description4?: string;
  tr_amount_out: number;
  tr_amount_in: number;
  balance: number;
  currency?: string;
  synced_at?: string;
  created_at: string;
  updated_at: string;
}

export interface BankTransactionList {
  total: number;
  items: BankTransaction[];
}

export interface BankTransactionSyncRequest {
  organization: string;
  account_no: string;
  start_date: string;
  end_date: string;
  client_type?: string;
}

export interface BankTransactionSyncResponse {
  total_count: number;
  new_count: number;
  updated_count: number;
  message: string;
}

export interface BankTransactionStats {
  total_count: number;
  total_in: number;
  total_out: number;
}

export const BANK_ORGANIZATION_MAP: Record<string, string> = {
  '0003': 'IBK기업은행',
  '0004': 'KB국민은행',
  '0011': 'NH농협은행',
  '0002': 'KDB산업은행',
  '0007': '수협은행',
  '0012': '지역농축협',
  '0020': '우리은행',
  '0023': 'SC제일은행',
  '0027': '한국씨티은행',
  '0031': '대구은행',
  '0032': '부산은행',
  '0034': '광주은행',
  '0035': '제주은행',
  '0037': '전북은행',
  '0039': '경남은행',
  '0045': '새마을금고',
  '0048': '신협',
  '0071': '우체국',
  '0081': '하나은행',
  '0088': '신한은행',
  '0089': '케이뱅크',
  '0090': '카카오뱅크',
  '0092': '토스뱅크',
};

// 은행 홈페이지 (회원가입용)
export const BANK_SIGNUP_URLS: Record<string, string> = {
  '0002': 'https://www.kdb.co.kr',
  '0003': 'https://www.ibk.co.kr',
  '0004': 'https://www.kbstar.com',
  '0007': 'https://www.suhyup-bank.com',
  '0011': 'https://banking.nonghyup.com',
  '0012': 'https://banking.nonghyup.com',
  '0020': 'https://www.wooribank.com',
  '0023': 'https://www.standardchartered.co.kr',
  '0027': 'https://www.citibank.co.kr',
  '0031': 'https://www.dgb.co.kr',
  '0032': 'https://www.busanbank.co.kr',
  '0034': 'https://www.kjbank.com',
  '0035': 'https://www.e-jejubank.com',
  '0037': 'https://www.jbbank.co.kr',
  '0039': 'https://www.knbank.co.kr',
  '0045': 'https://www.kfcc.co.kr',
  '0048': 'https://www.cu.co.kr',
  '0071': 'https://www.epostbank.go.kr',
  '0081': 'https://www.kebhana.com',
  '0088': 'https://www.shinhan.com',
  '0089': 'https://www.kbanknow.com',
  '0090': 'https://www.kakaobank.com',
  '0092': 'https://www.tossbank.com',
};
