import api from './api';
import { Product, ProductCreate, ProductUpdate } from '../types/product';

export const productService = {
  // 상품 목록 조회
  async getProducts(params?: {
    skip?: number;
    limit?: number;
    brand_ids?: string;  // 쉼표로 구분된 브랜드 ID 목록
    categories?: string;  // 쉼표로 구분된 카테고리 목록
    search?: string;
    is_active?: boolean;
  }): Promise<{ total: number; items: Product[] }> {
    const response = await api.get('/products', { params });
    return response.data;
  },

  // 상품 상세 조회
  async getProduct(id: string): Promise<Product> {
    const response = await api.get(`/products/${id}`);
    return response.data;
  },

  // 상품 등록
  async createProduct(data: ProductCreate): Promise<Product> {
    const response = await api.post('/products', data);
    return response.data;
  },

  // 상품 수정
  async updateProduct(id: string, data: ProductUpdate): Promise<Product> {
    const response = await api.put(`/products/${id}`, data);
    return response.data;
  },

  // 상품 삭제
  async deleteProduct(id: string): Promise<void> {
    await api.delete(`/products/${id}`);
  },

  // 상품코드 중복 체크
  async checkProductCode(productCode: string, excludeId?: string): Promise<boolean> {
    const params = excludeId ? { exclude_id: excludeId } : {};
    const response = await api.get(`/products/check-code/${productCode}`, { params });
    return response.data.exists;
  },
};