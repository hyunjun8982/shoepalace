import api from './api';

export interface TrendingProduct {
  id: number;
  rank: number;
  brand: string;
  product_name: string;
  kream_product_id: number;
  model_number?: string;
  category?: string;
  data_period?: string;
  upload_date: string;
  created_at: string;
  updated_at?: string;
}

export interface TrendingProductWithInventory extends TrendingProduct {
  inventory_count: number;
}

export interface TrendingProductList {
  total: number;
  items: TrendingProduct[];
}

export interface TrendingProductStats {
  total_count: number;
  by_brand: Record<string, number>;
  by_category: Record<string, number>;
  latest_upload_date?: string;
}

export const trendingProductService = {
  // 엑셀 파일 업로드
  async uploadExcel(file: File, category: string, dataPeriod?: string): Promise<any> {
    const formData = new FormData();
    formData.append('file', file);

    const response = await api.post(`/trending-products/upload/?category=${category}${dataPeriod ? `&data_period=${encodeURIComponent(dataPeriod)}` : ''}`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  },

  // 인기 상품 목록 조회
  async getTrendingProducts(params?: {
    skip?: number;
    limit?: number;
    category?: string;
    brand?: string;
  }): Promise<TrendingProductList> {
    const response = await api.get('/trending-products/', { params });
    return response.data;
  },

  // 재고 정보 포함 인기 상품 조회
  async getTrendingProductsWithInventory(params?: {
    limit?: number;
    category?: string;
    brand?: string;
  }): Promise<TrendingProductWithInventory[]> {
    const response = await api.get('/trending-products/with-inventory/', { params });
    return response.data;
  },

  // 통계 조회
  async getStats(): Promise<TrendingProductStats> {
    const response = await api.get('/trending-products/stats/');
    return response.data;
  },

  // 카테고리 목록 조회
  async getCategories(): Promise<string[]> {
    const response = await api.get('/trending-products/categories/');
    return response.data;
  },

  // 모든 데이터 삭제
  async deleteAll(): Promise<any> {
    const response = await api.delete('/trending-products/');
    return response.data;
  },
};
