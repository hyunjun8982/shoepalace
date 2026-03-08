export interface CardTransaction {
  id: string;
  user_id?: string;
  owner_name?: string;
  organization: string;
  client_type?: string;
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

export interface CardTransactionStats {
  total_amount: number;
  total_count: number;
  cancel_count: number;
  cancel_amount: number;
}

export interface CodefAccountInfo {
  id: string;
  organization: string;
  organization_name: string;
  client_type: string;
  login_id?: string;
  card_no?: string;
  connected_id?: string;
  owner_name?: string;
  is_connected: boolean;
  is_active?: boolean;
  connected_at?: string;
}

export interface CardInfo {
  card_name: string;
  card_no: string;
  card_type?: string;
  user_name?: string;
  is_sleep?: string;
  state?: string;
  image_link?: string;
  // 한도 관련 (새 기능)
  total_limit?: number;
  used_limit?: number;
  remaining_limit?: number;
}

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

export const PAYMENT_TYPE_MAP: Record<string, string> = {
  '1': '일시불',
  '2': '할부',
  '3': '그외',
};

export const CANCEL_STATUS_MAP: Record<string, string> = {
  'normal': '정상',
  'cancelled': '취소',
  'partial': '부분취소',
  'rejected': '거절',
};

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
  client_type?: string;
  synced_at?: string;
  created_at: string;
  updated_at: string;
}

export const BANK_ORGANIZATION_MAP: Record<string, string> = {
  '0002': 'KDB산업은행',
  '0003': 'IBK기업은행',
  '0004': 'KB국민은행',
  '0007': '수협은행',
  '0011': 'NH농협은행',
  '0012': '지역농축협',
  '0020': '우리은행',
  '0023': 'SC제일은행',
  '0027': '한국씨티은행',
  '0031': '아이엠뱅크(대구은행)',
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

export const BANK_COLORS: Record<string, string> = {
  '0004': '#fbbf24', // KB - 노란색
  '0011': '#16a34a', // NH - 초록
  '0020': '#3b82f6', // 우리 - 파란색
  '0081': '#059669', // 하나 - 초록
  '0088': '#2563eb', // 신한 - 파란색
  '0003': '#1e40af', // IBK - 남색
  '0090': '#facc15', // 카카오 - 노란색
  '0092': '#2563eb', // 토스 - 파란색
};

export const CARD_HOMEPAGE: Record<string, { P: string; B: string }> = {
  '0301': { P: 'https://card.kbcard.com/CXPRIMAIN/CXPRIMAIN0001.cms', B: 'https://biz.kbcard.com/CXBIMAIN/CXBIMAIN0001.cms' },
  '0302': { P: 'https://www.hyundaicard.com/cpm/mb/CPMML0101_01.hc', B: 'https://www.hyundaicard.com/cpm/mb/CPMML0101_01.hc' },
  '0303': { P: 'https://www.samsungcard.com/personal/main.jsp', B: 'https://www.samsungcard.com/corporation/main.jsp' },
  '0304': { P: 'https://card.nonghyup.com/main/main.do', B: 'https://card.nonghyup.com/main/main.do' },
  '0305': { P: 'https://www.bccard.com/app/main/main.do', B: 'https://company.bccard.com/app/main/main.do' },
  '0306': { P: 'https://www.shinhancard.com/pconts/html/main.html', B: 'https://company.shinhancard.com' },
  '0307': { P: 'https://www.citibank.co.kr', B: 'https://www.citibank.co.kr' },
  '0309': { P: 'https://pc.wooricard.com/dcpc/yh1/mcd/mcd01000s.do', B: 'https://biz.wooricard.com' },
  '0311': { P: 'https://www.lottecard.co.kr/app/LPMAACA_V100.lc', B: 'https://www.lottecard.co.kr/app/LCMBACA_V100.lc' },
  '0313': { P: 'https://www.hanacard.co.kr/main.do', B: 'https://www.hanacard.co.kr/corporation/main.do' },
  '0315': { P: 'https://card.jbbank.co.kr', B: 'https://card.jbbank.co.kr' },
  '0316': { P: 'https://card.kjbank.com', B: 'https://card.kjbank.com' },
  '0320': { P: 'https://www.suhyup-bank.com', B: 'https://www.suhyup-bank.com' },
  '0321': { P: 'https://www.jejubank.com', B: 'https://www.jejubank.com' },
};

export const BANK_HOMEPAGE: Record<string, { P: string; B: string }> = {
  '0002': { P: 'https://www.kdb.co.kr', B: 'https://www.kdb.co.kr' },
  '0003': { P: 'https://mybank.ibk.co.kr/uib/jsp/guest/pib/log/PGLOG0010_i.jsp', B: 'https://biz.ibk.co.kr' },
  '0004': { P: 'https://obank.kbstar.com/quics?page=C025255', B: 'https://obiz.kbstar.com' },
  '0007': { P: 'https://www.suhyup-bank.com', B: 'https://www.suhyup-bank.com' },
  '0011': { P: 'https://banking.nonghyup.com', B: 'https://banking.nonghyup.com/nfm/ERE0000000001.fcc' },
  '0012': { P: 'https://banking.nonghyup.com', B: 'https://banking.nonghyup.com' },
  '0020': { P: 'https://spd.wooribank.com/pib/Dream?withyou=CMLGN0001', B: 'https://biz.wooribank.com' },
  '0023': { P: 'https://www.standardchartered.co.kr', B: 'https://www.standardchartered.co.kr' },
  '0027': { P: 'https://www.citibank.co.kr', B: 'https://www.citibank.co.kr' },
  '0031': { P: 'https://www.dgb.co.kr', B: 'https://biz.dgb.co.kr' },
  '0032': { P: 'https://www.busanbank.co.kr', B: 'https://biz.busanbank.co.kr' },
  '0034': { P: 'https://www.kjbank.com', B: 'https://biz.kjbank.com' },
  '0035': { P: 'https://www.jejubank.com', B: 'https://biz.jejubank.com' },
  '0037': { P: 'https://www.jbbank.co.kr', B: 'https://biz.jbbank.co.kr' },
  '0039': { P: 'https://www.knbank.co.kr', B: 'https://biz.knbank.co.kr' },
  '0045': { P: 'https://www.kfcc.co.kr', B: 'https://www.kfcc.co.kr' },
  '0048': { P: 'https://www.cu.co.kr', B: 'https://www.cu.co.kr' },
  '0071': { P: 'https://www.epostbank.go.kr', B: 'https://www.epostbank.go.kr' },
  '0081': { P: 'https://www.kebhana.com/cont/mall/mall08/mall0801/index.jsp', B: 'https://biz.kebhana.com' },
  '0088': { P: 'https://bank.shinhan.com/index.jsp#020101030000', B: 'https://bizbank.shinhan.com' },
  '0089': { P: 'https://www.kbanknow.com', B: 'https://www.kbanknow.com' },
  '0090': { P: 'https://www.kakaobank.com', B: 'https://www.kakaobank.com' },
  '0092': { P: 'https://www.tossbank.com', B: 'https://www.tossbank.com' },
};

export const ORG_COLORS: Record<string, string> = {
  '0301': '#fbbf24', // KB - 노란색
  '0302': '#000000', // 현대 - 검정
  '0303': '#2563eb', // 삼성 - 파란색
  '0304': '#16a34a', // NH - 초록
  '0306': '#2563eb', // 신한 - 파란색
  '0309': '#3b82f6', // 우리 - 파란색
  '0311': '#dc2626', // 롯데 - 빨간색
  '0313': '#059669', // 하나 - 초록
};
