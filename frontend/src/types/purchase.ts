export enum PaymentType {
  CORP_CARD = 'corp_card',
  CORP_ACCOUNT = 'corp_account',
  PERSONAL_CARD = 'personal_card',
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
  payment_type: PaymentType;
  supplier?: string;
  receipt_url?: string;
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
  notes?: string;
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