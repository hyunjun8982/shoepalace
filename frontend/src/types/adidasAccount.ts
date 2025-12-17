export interface AdidasAccount {
  id: string;
  email: string;
  password: string;
  birthday?: string;
  adikr_barcode?: string;
  barcode_image_url?: string;
  name?: string;
  phone?: string;
  current_points?: number;
  owned_vouchers?: string;
  is_active: boolean;
  last_login?: string;
  last_coupon_check?: string;
  last_coupon_issued?: string;
  next_coupon_available_date?: string;
  fetch_status?: string;
  memo?: string;
  created_at: string;
  updated_at: string;
}

export interface AdidasAccountCreate {
  email: string;
  password: string;
  birthday?: string;
  adikr_barcode?: string;
  name?: string;
  phone?: string;
  is_active?: boolean;
  memo?: string;
}

export interface AdidasAccountInfo {
  email: string;
  name?: string;
  birthday?: string;
  adikr_barcode?: string;
  phone?: string;
  current_points?: number;
  owned_vouchers?: string;
}

export interface CouponStatus {
  account_id: string;
  email: string;
  discount_15: number;
  discount_20: number;
  amount_100k: number;
  amount_50k: number;
  total_coupons: number;
  last_checked?: string;
}
