import api from './api';

export interface BarcodeSearchResult {
  barcode_id: string;
  product_id: string;
  size: string;  // 사이즈
  barcode_value: string;
  product_code: string;
  product_name: string;
  brand_name?: string;
  category?: string;
  image_url?: string;
  available_qty: number;
}

export interface BarcodeCreate {
  product_id: string;
  size: string;  // 사이즈 (필수)
  barcode_value: string;
  barcode_type?: string;
  notes?: string;
}

export interface PoizonProductInfo {
  title: string;
  logo_url: string;
  sizes: Array<{
    size_kr: string;
    size_us?: string;
    sku_id: string;
    bar_code: string;
    average_price?: number;
    leak_price?: number;
  }>;
}

export const barcodeService = {
  // 바코드로 상품 검색
  searchByBarcode: async (barcodeValue: string): Promise<BarcodeSearchResult> => {
    try {
      const response = await api.get(
        `/barcodes/search/${barcodeValue.trim().toUpperCase()}`
      );
      return response.data;
    } catch (error: any) {
      if (error.response?.status === 404) {
        throw new Error('해당 바코드가 등록되지 않았습니다.');
      }
      throw error;
    }
  },

  // 바코드 등록
  createBarcode: async (data: BarcodeCreate) => {
    const response = await api.post(`/barcodes/`, data);
    return response.data;
  },

  // 상품 코드로 바코드 조회
  getBarcodeByProductId: async (productId: string) => {
    try {
      const response = await api.get(`/barcodes/product/${productId}`);
      return response.data;
    } catch (error: any) {
      if (error.response?.status === 404) {
        return null;
      }
      throw error;
    }
  },

  // 바코드 수정
  updateBarcode: async (barcodeId: string, data: Partial<BarcodeCreate>) => {
    const response = await api.put(`/barcodes/${barcodeId}`, data);
    return response.data;
  },

  // 바코드 삭제
  deleteBarcode: async (barcodeId: string) => {
    await api.delete(`/barcodes/${barcodeId}`);
  },

  // 상품의 모든 바코드 조회
  getAllBarcodesByProduct: async (productId: string) => {
    try {
      const response = await api.get(`/barcodes/product/${productId}/all`);
      return response.data;
    } catch (error: any) {
      if (error.response?.status === 404) {
        return [];
      }
      throw error;
    }
  },

  // 포이즌 API에서 바코드로 상품 정보 조회
  lookupBarcodeFromPoizon: async (barcodeValue: string): Promise<PoizonProductInfo | null> => {
    try {
      const response = await api.get(
        `/barcodes/poizon/${barcodeValue.trim().toUpperCase()}`
      );
      return response.data;
    } catch (error: any) {
      if (error.response?.status === 404) {
        return null; // 포이즌에서 바코드를 못 찾음
      }
      throw error;
    }
  },
};
