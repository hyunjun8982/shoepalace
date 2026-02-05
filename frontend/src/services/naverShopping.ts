import apiClient from './api';

export interface NaverSeller {
  title: string;
  link: string;
  lprice: string;
  mallName: string;
}

export interface NaverShoppingSearchResponse {
  product_code: string;
  total: number;
  sellers: NaverSeller[];
}

class NaverShoppingService {
  /**
   * 상품코드로 네이버쇼핑 판매처 검색
   */
  async searchProduct(productCode: string): Promise<NaverShoppingSearchResponse> {
    const response = await apiClient.get<NaverShoppingSearchResponse>(
      `/naver-shopping/search/${productCode}`
    );
    return response.data;
  }
}

export const naverShoppingService = new NaverShoppingService();
