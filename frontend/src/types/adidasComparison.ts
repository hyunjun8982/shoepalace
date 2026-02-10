export interface AdidasComparisonSummary {
  product_code: string;
  total_purchased_qty: number;
  total_sales_qty: number;
  difference: number;
}

export interface AdidasComparisonSummaryResponse {
  items: AdidasComparisonSummary[];
  total: number;
  total_purchased: number;
  total_sold: number;
}

export interface AdidasComparisonPurchase {
  id: string;
  product_code: string;
  size: string | null;
  quantity: number;
  unit_price: number | null;
  buyer_name: string;
  source: string;
  category: string | null;
  note: string | null;
  created_at: string;
}

export interface AdidasComparisonSale {
  id: string;
  product_code: string;
  size: string | null;
  quantity: number;
  unit_price: number | null;
  total_price: number | null;
  source: string;
  sale_date: string | null;
  note: string | null;
  created_at: string;
}

export interface AdidasComparisonPurchaseCreate {
  product_code: string;
  quantity: number;
  size?: string;
  unit_price?: number;
  note?: string;
}

export interface AdidasComparisonStats {
  purchase_count: number;
  sale_count: number;
  purchase_product_codes: number;
  sale_product_codes: number;
}
