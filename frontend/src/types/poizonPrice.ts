export interface PriceDetail {
  size_kr: string;
  size_us: string | null;
  average_price: number | null;
  leak_price: number | null;
}

export interface PoizonPriceWatchItem {
  article_number: string;
  found: boolean;
  title: string | null;
  logo_url: string | null;
  spu_id: number | null;
  avg_price_small: number | null;
  avg_price_large: number | null;
  avg_price_apparel: number | null;
  price_details: PriceDetail[] | null;
  sell_price: number | null;
  created_at: string;
}

export interface PoizonPriceWatchListResponse {
  items: PoizonPriceWatchItem[];
  total: number;
  found_count: number;
  not_found_count: number;
}

export interface PoizonPriceRefreshStatus {
  is_refreshing: boolean;
  current: number;
  total: number;
  message: string;
}
