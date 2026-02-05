import apiClient from './api';

export interface SizeWithPrice {
  size_kr: string;
  size_us: string | null;
  sku_id: string;
  average_price: number | null;
}

export interface ProductPricesResponse {
  spu_id: number;
  sizes: SizeWithPrice[];
}

class PoizonService {
  /**
   * SPU ID로 모든 사이즈와 가격 정보를 한번에 조회
   */
  async getProductPrices(spuId: number): Promise<ProductPricesResponse> {
    const response = await apiClient.get<ProductPricesResponse>(`/poizon/product-prices/${spuId}`);
    return response.data;
  }
}

export const poizonService = new PoizonService();
