import api from './api';

export interface PoizonProduct {
  id: string;
  brand_key: string;
  brand_name: string;
  level1_category_name: string | null;
  title: string;
  article_number: string;
  logo_url: string | null;
  spu_id: number | null;
  // 미리 계산된 평균가
  avg_price_small: number | null;    // 신발 소형 (220-250)
  avg_price_large: number | null;    // 신발 대형 (255-290)
  avg_price_apparel: number | null;  // 의류 (S~XXL)
  created_at: string;
  updated_at: string;
}

export interface BrandProductsResponse {
  brand_key: string;
  brand_name: string;
  products: PoizonProduct[];
  total: number;
}

export interface SyncRequest {
  start_page: number;
  end_page: number;
}

export interface SyncResponse {
  brand_key: string;
  brand_name: string;
  total_synced: number;
  message: string;
}

export interface PriceInfo {
  sku_id: string;
  size_kr: string;
  size_us: string | null;
  average_price: number | null;
}

export interface ProductPricesResponse {
  spu_id: number;
  prices: PriceInfo[];
  total: number;
}

export interface BatchPricesResponse {
  prices: Record<number, PriceInfo[]>;
}

export interface SyncStatus {
  brand_key: string;
  brand_name: string;
  is_syncing: boolean;
  current_page: number;
  total_pages: number;
  products_synced: number;
  prices_synced: number;
  message: string;
  started_at: string | null;
}

export const poizonProductsService = {
  /**
   * DB에서 브랜드별 상품 조회
   */
  async getProductsByBrand(brandKey: string): Promise<BrandProductsResponse> {
    const response = await api.get(`/poizon-products/brands/${brandKey}`);
    return response.data;
  },

  /**
   * Poizon API에서 상품 정보 가져와서 DB에 저장 (업데이트)
   */
  async syncBrandProducts(
    brandKey: string,
    endPage: number = 495
  ): Promise<SyncResponse> {
    const response = await api.post(`/poizon-products/brands/${brandKey}/sync`, {
      end_page: endPage,
    });
    return response.data;
  },

  /**
   * 브랜드의 마지막 업데이트 시간 조회
   */
  async getLastUpdate(brandKey: string) {
    const response = await api.get(`/poizon-products/brands/${brandKey}/last-update`);
    return response.data;
  },

  /**
   * 전체 상품 통계 조회
   */
  async getStats() {
    const response = await api.get('/poizon-products/stats');
    return response.data;
  },

  /**
   * SPU ID로 가격 정보 조회
   */
  async getPricesBySpuId(spuId: number): Promise<ProductPricesResponse> {
    const response = await api.get(`/poizon-products/prices/${spuId}`);
    return response.data;
  },

  /**
   * 여러 SPU ID의 가격 정보 일괄 조회
   */
  async getBatchPrices(spuIds: number[]): Promise<BatchPricesResponse> {
    const response = await api.post('/poizon-products/prices/batch', { spu_ids: spuIds });
    return response.data;
  },

  /**
   * 동기화 진행 상황 조회
   */
  async getSyncStatus(brandKey: string): Promise<SyncStatus> {
    const response = await api.get(`/poizon-products/sync-status/${brandKey}`);
    return response.data;
  },
};
