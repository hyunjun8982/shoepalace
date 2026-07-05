import api from './api';
import { Product, ProductCreate, ProductUpdate } from '../types/product';
import { Brand } from '../types';

export const productService = {
  // 상품 목록 조회
  async getProducts(params?: {
    skip?: number;
    limit?: number;
    brand_ids?: string;  // 쉼표로 구분된 브랜드 ID 목록
    categories?: string;  // 쉼표로 구분된 카테고리 목록
    search?: string;
    is_active?: boolean;
    only_valid?: boolean;  // 브랜드, 상품코드, 카테고리가 모두 있는 상품만
    order_by?: string;  // 정렬 기준: inventory_desc (재고량 내림차순)
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

  // 상품 관련 항목 조회
  async getRelatedItems(productId: string): Promise<any> {
    const response = await api.get(`/products/${productId}/related-items`);
    return response.data;
  },

  // 상품 및 선택된 관련 항목 삭제
  async deleteProductWithItems(productId: string, deleteData: any): Promise<void> {
    await api.post(`/products/${productId}/delete-with-items`, deleteData);
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

  // 상품코드로 상품 조회
  async getProductByCode(productCode: string): Promise<Product | null> {
    try {
      const response = await api.get(`/products/by-code/${productCode}`);
      return response.data;
    } catch (error) {
      return null;
    }
  },

  // 브랜드 목록 조회
  async getBrands(): Promise<Brand[]> {
    const response = await api.get('/brands');
    return response.data.items || response.data || [];
  },
};