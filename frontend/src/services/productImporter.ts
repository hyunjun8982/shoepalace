import api from './api';

export interface BrandInfo {
  key: string;
  name: string;
  description: string;
}

export interface ImportRequest {
  brand: string;
  limit?: number;
  category?: string;
  update_existing?: boolean;
}

export interface ImportResponse {
  success: boolean;
  brand: string;
  stats: {
    created: number;
    updated: number;
    skipped: number;
    failed: number;
  };
  message: string;
}

export interface BrandSummary {
  brand: string;
  brand_key: string;
  total_products: number;
}

// 지원 브랜드 목록 조회
export const getAvailableBrands = async (): Promise<BrandInfo[]> => {
  const response = await api.get('/product-importer/brands');
  return response.data;
};

// 브랜드 상품 가져오기
export const importBrandProducts = async (request: ImportRequest): Promise<ImportResponse> => {
  const response = await api.post('/product-importer/import', request);
  return response.data;
};

// 브랜드 상품 통계
export const getBrandSummary = async (brand: string): Promise<BrandSummary> => {
  const response = await api.get(`/product-importer/summary/${brand}`);
  return response.data;
};
