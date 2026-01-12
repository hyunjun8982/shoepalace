export enum PaymentType {
  CORP_CARD = 'corp_card',
  CORP_ACCOUNT = 'corp_account',
  PERSONAL_CARD = 'personal_card',
  PERSONAL_CARD_INSER = 'personal_card_inser',
  PERSONAL_CARD_DAHEE = 'personal_card_dahee',
}

export enum PurchaseStatus {
  PENDING = 'pending',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
}

export interface ProductInfo {
  id: string;
  product_code: string;
  product_name: string;
  category?: string;
  size?: string;
  color?: string;
  brand_name?: string;
  brand_icon_url?: string;
}
export interface WarehouseInfo {
  id: string;
  warehouse_code: string;
  name: string;
  location?: string;
}

export interface PurchaseItem {
  id?: string;
  product_id: string;
  warehouse_id?: string;
  product_name?: string;
  product_code?: string;
  product?: ProductInfo;
  warehouse?: WarehouseInfo;
  size?: string;
  quantity: number;
  purchase_price: number;
  selling_price?: number;
  margin_rate?: number;
  receipt_image_url?: string;
  product_image_url?: string;
  notes?: string;
  created_at?: string;
}

export interface Purchase {
  id: string;
  transaction_no: string;
  purchase_date: string;
  buyer_id: string;
  buyer_name?: string;
  receiver_id?: string;
  receiver_name?: string;
  is_confirmed: boolean;
  confirmed_at?: string;
  payment_type: PaymentType;
  supplier?: string;
  receipt_url?: string;
  receipt_urls?: string[];  // 다중 영수증 URL
  total_amount: number;
  status: PurchaseStatus;
  notes?: string;
  created_at: string;
  updated_at: string;
  items: PurchaseItem[];
}

export interface PurchaseCreate {
  transaction_no: string;
  purchase_date: string;
  payment_type: PaymentType;
  supplier?: string;
  receipt_url?: string;
  receipt_urls?: string[];  // 다중 영수증 URL
  notes?: string;
  buyer_id?: string;
  receiver_id?: string;
  items: PurchaseItem[];
}

export interface PurchaseUpdate {
  transaction_no?: string;
  purchase_date?: string;
  payment_type?: PaymentType;
  supplier?: string;
  status?: PurchaseStatus;
  notes?: string;
}