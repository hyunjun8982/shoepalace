import api from './api';
import { Purchase, PurchaseCreate, PurchaseUpdate } from '../types/purchase';

export const purchaseService = {
  // 다음 거래번호 가져오기
  async getNextTransactionNo(): Promise<string> {
    const response = await api.get('/purchases/next-transaction-no');
    return response.data.transaction_no;
  },

  // 구매 목록 조회
  async getPurchases(params?: {
    skip?: number;
    limit?: number;
    start_date?: string;
    end_date?: string;
    payment_type?: string | string[];
    status?: string | string[];
    brand_name?: string | string[];
    buyer_id?: string | string[];
    search?: string;
  }): Promise<{ total: number; items: Purchase[] }> {
    const response = await api.get('/purchases', { params });
    return response.data;
  },

  // 구매 상세 조회
  async getPurchase(id: string): Promise<Purchase> {
    const response = await api.get(`/purchases/${id}`);
    return response.data;
  },

  // 구매 등록
  async createPurchase(data: PurchaseCreate): Promise<Purchase> {
    const response = await api.post('/purchases', data);
    return response.data;
  },

  // 구매 수정
  async updatePurchase(id: string, data: PurchaseUpdate): Promise<Purchase> {
    const response = await api.put(`/purchases/${id}`, data);
    return response.data;
  },

  // 구매 삭제
  async deletePurchase(id: string, deleteInventory: boolean = false): Promise<void> {
    await api.delete(`/purchases/${id}`, { params: { delete_inventory: deleteInventory } });
  },

  // 영수증 업로드
  async uploadReceipt(id: string, file: File): Promise<{ message: string; file_path: string; url: string }> {
    const formData = new FormData();
    formData.append('file', file);
    const response = await api.post(`/purchases/${id}/upload-receipt`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  },

  // 입고 확인
  async confirmPurchase(id: string): Promise<Purchase> {
    const response = await api.post(`/purchases/${id}/confirm`);
    return response.data;
  },

  // 입고 확인 취소
  async unconfirmPurchase(id: string): Promise<Purchase> {
    const response = await api.post(`/purchases/${id}/unconfirm`);
    return response.data;
  },

  // ============ 영수증 QR 코드 업로드 관련 ============

  // 영수증 업로드 토큰 생성
  async generateReceiptUploadToken(): Promise<{ token: string; expires_at: string }> {
    const response = await api.post('/purchases/receipt-upload-token/generate');
    return response.data;
  },

  // 영수증 업로드 상태 확인 (폴링용)
  async checkReceiptUploadStatus(token: string): Promise<{ valid: boolean; uploaded_urls: string[]; upload_count: number }> {
    const response = await api.get(`/purchases/receipt-upload-token/${token}/status`);
    return response.data;
  },
};