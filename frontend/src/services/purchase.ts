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
    payment_type?: string;
    status?: string;
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
};