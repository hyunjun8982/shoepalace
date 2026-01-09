import api from './api';
import {
  InventoryList,
  InventoryDetail,
  InventoryUpdate,
  InventoryListParams,
  InventoryAdjustmentCreate,
  InventoryAdjustment,
  InventoryAdjustmentList
} from '../types/inventory';

export const inventoryService = {
  // 재고 목록 조회
  async getInventoryList(params: InventoryListParams = {}): Promise<InventoryList> {
    const response = await api.get('/inventory/', { params });
    return response.data;
  },

  // 특정 상품 재고 조회
  async getInventory(productId: string): Promise<InventoryDetail> {
    const response = await api.get(`/inventory/${productId}/`);
    return response.data;
  },

  // 재고 정보 수정
  async updateInventory(productId: string, data: InventoryUpdate): Promise<InventoryDetail> {
    const response = await api.put(`/inventory/${productId}/`, data);
    return response.data;
  },

  // 재고 조정
  async createAdjustment(data: InventoryAdjustmentCreate): Promise<InventoryAdjustment> {
    const response = await api.post('/inventory/adjust/', data);
    return response.data;
  },

  // 재고 조정 이력 조회
  async getAdjustmentHistory(params?: {
    skip?: number;
    limit?: number;
    product_id?: string;
    adjustment_type?: string;
  }): Promise<InventoryAdjustmentList> {
    const response = await api.get('/inventory/adjustments/history/', { params });
    return response.data;
  },

  // 재고 부족 알림 목록
  async getLowStockAlert(): Promise<InventoryList> {
    const response = await api.get('/inventory/low-stock/alert/');
    return response.data;
  },

  // 재고 상세 조회 (구매/판매 이력 포함)
  async getInventoryDetail(productId: string): Promise<any> {
    const response = await api.get(`/inventory/product/${productId}/detail`);
    return response.data;
  },
  // 재고 삭제 (관리자만) - 기존 메서드는 사용하지 않음
  async deleteInventory(inventoryId: string): Promise<void> {
    await api.delete(`/inventory/${inventoryId}`);
  },

  // 상품의 모든 재고 삭제 (관리자만, 구매/판매 이력이 없는 경우만)
  async deleteProductInventory(productId: string): Promise<any> {
    const response = await api.delete(`/inventory/product/${productId}`);
    return response.data;
  },

  // 재고 수량 조정 (관리자만)
  async adjustInventoryQuantity(inventoryId: string, quantityChange: number, reason?: string): Promise<any> {
    const response = await api.post(`/inventory/${inventoryId}/adjust`, null, {
      params: { quantity_change: quantityChange, reason: reason || '' }
    });
    return response.data;
  },

  // 새로운 사이즈 재고 생성 또는 업데이트 (관리자만)
  async createInventoryForSize(productId: string, size: string, quantity: number): Promise<any> {
    const response = await api.post(`/inventory/product/${productId}/size`, null, {
      params: { size, quantity }
    });
    return response.data;
  },

  // 불량 물품 목록 조회
  async getDefectiveInventoryList(params?: {
    skip?: number;
    limit?: number;
    search?: string;
  }): Promise<InventoryList> {
    const response = await api.get('/inventory/defective/list', { params });
    return response.data;
  },

  // 불량 등록/해제 (수량 단위)
  async markDefective(inventoryId: string, action: 'add' | 'remove', defectReason?: string, defectImageUrl?: string, quantity: number = 1): Promise<any> {
    const response = await api.post(`/inventory/${inventoryId}/mark-defective`, {
      action,
      quantity,
      defect_reason: defectReason,
      defect_image_url: defectImageUrl
    });
    return response.data;
  },

  // 불량 이미지 업로드
  async uploadDefectImage(inventoryId: string, file: File): Promise<{ message: string; file_path: string; url: string }> {
    const formData = new FormData();
    formData.append('file', file);
    const response = await api.post(`/inventory/${inventoryId}/upload-defect-image`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  },

  // QR 코드용 업로드 토큰 생성
  async generateUploadToken(inventoryId: string): Promise<{ token: string; expires_at: string; inventory_id: string }> {
    const response = await api.post(`/inventory/upload-token/generate?inventory_id=${inventoryId}`);
    return response.data;
  },

  // 업로드 상태 확인 (폴링용)
  async checkUploadStatus(token: string): Promise<{ valid: boolean; uploaded: boolean; image_url?: string }> {
    const response = await api.get(`/inventory/upload-token/${token}/status`);
    return response.data;
  },
};
