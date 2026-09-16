import api from './api';

export interface ReturnItem {
  id: string;
  product_id: string;
  size: string;
  quantity: number;
  reason?: string;
  image_url?: string;
  status: 'in_stock' | 'shipped';
  created_at: string;
  product_name?: string;
  brand_name?: string;
  sku_code?: string;
  received_by_name?: string;
  // 출고 정보
  sale_date?: string;
  customer_name?: string;
  customer_contact?: string;
  sale_price?: number;
  tracking_number?: string;
  ship_notes?: string;
  shipped_by_name?: string;
  shipped_at?: string;
}

export interface ReturnItemList {
  total: number;
  items: ReturnItem[];
}

export interface ReturnShipData {
  sale_date: string; // YYYY-MM-DD
  customer_name: string;
  customer_contact?: string;
  sale_price?: number;
  tracking_number?: string;
  notes?: string;
}

export const returnService = {
  // 반품 건 목록 조회 (건별 개별)
  async getReturnItems(params?: {
    skip?: number;
    limit?: number;
    status?: 'in_stock' | 'shipped' | 'all';
    search?: string;
  }): Promise<ReturnItemList> {
    const response = await api.get('/returns/', { params });
    return response.data;
  },

  // 반품 입고 (구매금액 0원, 건별 등록)
  async createReturnItem(productId: string, size: string, reason?: string): Promise<ReturnItem> {
    const response = await api.post('/returns/', {
      product_id: productId,
      size,
      reason,
    });
    return response.data;
  },

  // 반품 건 불량 사진 업로드
  async uploadReturnImage(returnId: string, file: File): Promise<{ message: string; url: string }> {
    const formData = new FormData();
    formData.append('file', file);
    const response = await api.post(`/returns/${returnId}/image`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  },

  // 반품 출고 처리 (판매 정보 기록)
  async shipReturnItem(returnId: string, data: ReturnShipData): Promise<ReturnItem> {
    const response = await api.post(`/returns/${returnId}/ship`, data);
    return response.data;
  },

  // 반품 입고 취소 (보유 중 상태만)
  async deleteReturnItem(returnId: string): Promise<{ message: string }> {
    const response = await api.delete(`/returns/${returnId}`);
    return response.data;
  },
};
