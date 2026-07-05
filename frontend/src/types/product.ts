export interface Inventory {
  id: string;
  product_id: string;
  size: string;
  quantity: number;
  reserved_quantity: number;
  location?: string;
  min_stock_level?: number;
  created_at: string;
  updated_at: string;
}

export interface Barcode {
  id: string;
  product_id: string;
  barcode_value: string;
  barcode_type: string;
  is_active: boolean;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface Product {
  id: string;
  brand_id: string;
  brand_name?: string;
  brand_icon_url?: string;
  product_code: string;
  product_name: string;
  description?: string;
  image_url?: string;
  inventory?: Inventory[];
  barcode?: Barcode;
  created_at: string;
  updated_at: string;
}

export interface ProductCreate {
  brand_id: string;
  product_code: string;
  product_name: string;
  description?: string;
}

export interface ProductUpdate {
  brand_id?: string;
  product_code?: string;
  product_name?: string;
  description?: string;
}