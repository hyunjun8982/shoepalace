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

export interface Product {
  id: string;
  brand_id: string;
  brand_name?: string;
  brand_icon_url?: string;
  product_code: string;
  product_name: string;
  category?: string;
  description?: string;
  image_url?: string;
  inventory?: Inventory[];
  created_at: string;
  updated_at: string;
}

export interface ProductCreate {
  brand_id: string;
  product_code: string;
  product_name: string;
  category?: string;
  description?: string;
}

export interface ProductUpdate {
  brand_id?: string;
  product_code?: string;
  product_name?: string;
  category?: string;
  description?: string;
}