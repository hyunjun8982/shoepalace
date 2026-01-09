import api from './api';
import { Sale, SaleCreate, SaleUpdate, SaleList, SaleListParams } from '../types/sale';

export const saleService = {
  // 판매 목록 조회
  async getSales(params: SaleListParams = {}): Promise<SaleList> {
    const response = await api.get('/sales', { params });
    return response.data;
  },

  // 판매 상세 조회
  async getSale(saleId: string): Promise<Sale> {
    const response = await api.get(`/sales/${saleId}`);
    return response.data;
  },

  // 판매 등록
  async createSale(saleData: SaleCreate): Promise<Sale> {
    const response = await api.post('/sales', saleData);
    return response.data;
  },

  // 판매 수정
  async updateSale(saleId: string, saleData: SaleUpdate): Promise<Sale> {
    const response = await api.put(`/sales/${saleId}`, saleData);
    return response.data;
  },

  // 판매 삭제
  async deleteSale(saleId: string): Promise<void> {
    await api.delete(`/sales/${saleId}`);
  },

  // 판매 아이템 업데이트 (관리자용)
  async updateSaleItem(itemId: string, data: {
    company_sale_price?: number;
    seller_margin?: number;
  }): Promise<void> {
    await api.patch(`/sales/items/${itemId}`, data);
  },

  // 거래명세서 업로드
  async uploadTransactionStatement(saleId: string, formData: FormData): Promise<any> {
    console.log('=== Sale Service uploadTransactionStatement ===');
    console.log('Sale ID:', saleId);
    console.log('FormData:', formData);
    console.log('FormData entries:');
    Array.from(formData.entries()).forEach(([key, value]) => {
      console.log(`  ${key}:`, value);
    });

    const response = await api.post(`/sales/${saleId}/upload-transaction-statement`, formData);
    console.log('Upload response:', response);
    return response.data;
  },

  // 세금계산서 업로드
  async uploadTaxInvoice(saleId: string, formData: FormData): Promise<any> {
    console.log('=== Sale Service uploadTaxInvoice ===');
    console.log('Sale ID:', saleId);
    console.log('FormData:', formData);
    console.log('FormData entries:');
    Array.from(formData.entries()).forEach(([key, value]) => {
      console.log(`  ${key}:`, value);
    });

    const response = await api.post(`/sales/${saleId}/upload-tax-invoice`, formData);
    console.log('Upload response:', response);
    return response.data;
  },

  // 반품 처리
  async processReturn(saleId: string): Promise<{ message: string }> {
    const response = await api.post(`/sales/${saleId}/return`);
    return response.data;
  },

  // 반품 취소
  async cancelReturn(saleId: string): Promise<{ message: string }> {
    const response = await api.post(`/sales/${saleId}/cancel-return`);
    return response.data;
  }
};