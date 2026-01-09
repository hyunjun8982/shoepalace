export enum SaleStatus {
  PENDING = 'pending',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
  RETURNED = 'returned',
}

export interface SaleItem {
  id?: string;
  sale_id?: string;
  product_id: string;
  product_name?: string;
  product_code?: string;
  brand_name?: string;
  product_image_url?: string;
  size?: string;
  quantity: number;
  seller_sale_price_original: number; // 판매자 판매가격(원본 통화)
  seller_sale_currency?: string; // 판매 국가/통화
  seller_sale_price_krw: number; // 판매자 판매가격(한국 환율)
  company_sale_price?: number; // 회사 판매가격 (관리자 입력)
  seller_margin?: number; // 판매자 마진 (자동 계산)
  created_at?: string;
  updated_at?: string;
  product?: any; // Product 타입 참조
}

export interface SaleItemCreate {
  product_id: string;
  product_name?: string;
  size?: string;
  quantity: number;
  seller_sale_price_original: number;
  seller_sale_currency?: string;
  seller_sale_price_krw: number;
  product_image_url?: string;
}

export interface Sale {
  id?: string;
  sale_number?: string; // 판매번호 (S로 시작)
  sale_date: string;
  seller_id?: string;
  seller_name?: string; // 판매자명 표시용
  customer_name?: string; // 고객명 또는 고객처
  customer_contact?: string;
  total_seller_amount?: number; // 총 판매자 판매금액
  total_company_amount?: number; // 총 회사 판매금액
  total_seller_margin?: number; // 총 판매자 마진
  status?: SaleStatus;
  notes?: string;
  transaction_statement_url?: string; // 거래명세서 URL
  tax_invoice_url?: string; // 세금계산서 URL
  created_at?: string;
  updated_at?: string;
  items?: SaleItem[];
}

export interface SaleCreate {
  sale_date: string;
  customer_name?: string;
  customer_contact?: string;
  notes?: string;
  transaction_statement_url?: string;
  tax_invoice_url?: string;
  items: SaleItemCreate[];
}

export interface SaleUpdate {
  sale_date?: string;
  customer_name?: string;
  customer_contact?: string;
  status?: SaleStatus;
  notes?: string;
  transaction_statement_url?: string;
  tax_invoice_url?: string;
  total_seller_amount?: number;
  total_company_amount?: number;
  total_seller_margin?: number;
}

export interface SaleList {
  total: number;
  items: Sale[];
}

export interface SaleListParams {
  skip?: number;
  limit?: number;
  start_date?: string;
  end_date?: string;
  status?: SaleStatus | SaleStatus[];
  brand_name?: string | string[];
  search?: string; // 고객명, 연락처 검색
}