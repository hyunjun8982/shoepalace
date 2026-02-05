import api from './api';

export interface SellerInfo {
  mall_name: string;
  price: number;
  link: string;
}

export interface ProductSellerResult {
  id: string;
  product_name: string;
  model_number?: string;
  image_url?: string;
  poison_price?: number;
  sellers: SellerInfo[];
}

export interface ProductSellerSearchResponse {
  results: ProductSellerResult[];
  total: number;
}

export const productSellerFinderService = {
  /**
   * 상품 판매처 검색
   */
  async searchProductSellers(
    keyword: string,
    pageSize: number = 10
  ): Promise<ProductSellerSearchResponse> {
    const response = await api.get('/product-seller-finder/search', {
      params: {
        keyword,
        page_size: pageSize,
      },
    });
    return response.data;
  },
};
