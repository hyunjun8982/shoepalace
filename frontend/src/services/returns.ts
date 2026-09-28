import api from './api';

// 판매처 등록 여부: 등록완료 / 미등록 / 보류
export type RegistrationStatus = 'registered' | 'unregistered' | 'hold';

export const REGISTRATION_STATUS_OPTIONS: { value: RegistrationStatus; label: string; color: string }[] = [
  { value: 'registered', label: '등록완료', color: 'green' },
  { value: 'unregistered', label: '미등록', color: 'default' },
  { value: 'hold', label: '보류', color: 'orange' },
];

// 등록처 기본 선택지 (그 외는 직접 입력)
export const REGISTRATION_PLATFORM_PRESETS = ['크림', '포이즌'];

export interface ReturnItem {
  id: string;
  product_id: string;
  size: string;
  quantity: number;
  reason?: string;
  image_url?: string;
  status: 'in_stock' | 'shipped';
  registration_status: RegistrationStatus;
  registration_platforms?: string[] | null;
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

export interface ReturnBatchLine {
  product_id: string;
  size: string;
  quantity: number;
  reason?: string;
  registration_status: RegistrationStatus;
  registration_platforms?: string[];
}

export interface ReturnBatchResult {
  total_created: number;
  lines: { ids: string[] }[]; // 입력 줄 순서대로 생성된 반품 건 ID
}

export const returnService = {
  // 반품 건 목록 조회 (건별 개별)
  async getReturnItems(params?: {
    skip?: number;
    limit?: number;
    status?: 'in_stock' | 'shipped' | 'all';
    registration_status?: RegistrationStatus;
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

  // 일괄 반품 입고 (수량만큼 개별 건 생성)
  async createReturnItemsBatch(items: ReturnBatchLine[]): Promise<ReturnBatchResult> {
    const response = await api.post('/returns/batch', { items });
    return response.data;
  },

  // 판매처 등록 여부 수정
  async updateRegistration(
    returnId: string,
    registrationStatus: RegistrationStatus,
    registrationPlatforms?: string[],
  ): Promise<ReturnItem> {
    const response = await api.patch(`/returns/${returnId}/registration`, {
      registration_status: registrationStatus,
      registration_platforms: registrationPlatforms,
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
