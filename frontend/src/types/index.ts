// 사용자 관련 타입
export interface User {
  id: string;
  username: string;
  email: string;
  full_name: string;
  role: 'admin' | 'buyer' | 'seller';
  is_active: boolean;
}

// 인증 관련 타입
export interface LoginForm {
  username: string;
  password: string;
}

export interface AuthToken {
  access_token: string;
  token_type: string;
}

// 브랜드 관련 타입
export interface Brand {
  id: string;
  name: string;
  description?: string;
  is_active: boolean;
  created_at: string;
}

// 상품 관련 타입
export interface Product {
  id: string;
  brand_id: string;
  product_code: string;
  product_name: string;
  category?: string;
  size?: string;
  color?: string;
  description?: string;
  is_active: boolean;
  brand?: Brand;
}

// 구매 관련 타입
export interface Purchase {
  id: string;
  transaction_no: string;
  purchase_date: string;
  buyer_id: string;
  payment_type: 'corp_card' | 'corp_account' | 'personal_card';
  supplier?: string;
  total_amount: number;
  status: 'pending' | 'completed' | 'cancelled';
  notes?: string;
  buyer?: User;
  items?: PurchaseItem[];
}

export interface PurchaseItem {
  id: string;
  purchase_id: string;
  product_id: string;
  quantity: number;
  purchase_price: number;
  selling_price?: number;
  margin_rate?: number;
  receipt_image_url?: string;
  product_image_url?: string;
  notes?: string;
  product?: Product;
}

// API 응답 타입
export interface ApiResponse<T> {
  data: T;
  message?: string;
  success: boolean;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  size: number;
  pages: number;
}