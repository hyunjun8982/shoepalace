export interface Inventory {
  id?: string;
  product_id: string;
  quantity: number;
  reserved_quantity: number;
  available_quantity?: number;
  location?: string;
  min_stock_level: number;
  is_low_stock?: boolean;
  last_updated?: string;
  created_at?: string;
  updated_at?: string;
}

export interface InventoryUpdate {
  quantity?: number;
  reserved_quantity?: number;
  location?: string;
  min_stock_level?: number;
}

export interface InventoryDetail extends Inventory {
  product_name: string;
  brand: string;
  category: string;
  size?: string;
  color?: string;
  sku_code?: string;
  warehouse_name?: string;
  warehouse_location?: string;
  warehouse_image_url?: string;
}

export interface InventoryList {
  total: number;
  items: InventoryDetail[];
}

export interface InventoryListParams {
  skip?: number;
  limit?: number;
  search?: string;
  category?: string;
  low_stock_only?: boolean;
}

export enum AdjustmentType {
  PURCHASE = 'purchase',
  SALE = 'sale',
  RETURN = 'return',
  DAMAGE = 'damage',
  ADJUSTMENT = 'adjustment',
  TRANSFER = 'transfer',
}

export interface InventoryAdjustment {
  id?: string;
  product_id: string;
  adjustment_type: AdjustmentType;
  quantity: number;
  reference_id?: string;
  notes?: string;
  adjusted_by?: string;
  created_at?: string;
  updated_at?: string;
}

export interface InventoryAdjustmentCreate {
  product_id: string;
  adjustment_type: string;
  quantity: number;
  reference_id?: string;
  notes?: string;
}

export interface InventoryAdjustmentList {
  total: number;
  items: InventoryAdjustment[];
}