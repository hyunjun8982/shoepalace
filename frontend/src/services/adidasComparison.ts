import api from './api';
import {
  AdidasComparisonSummaryResponse,
  AdidasComparisonPurchase,
  AdidasComparisonSale,
  AdidasComparisonPurchaseCreate,
  AdidasComparisonStats,
} from '../types/adidasComparison';

export const adidasComparisonService = {
  async getSummary(search?: string): Promise<AdidasComparisonSummaryResponse> {
    const response = await api.get('/adidas-comparison/summary', {
      params: search ? { search } : undefined,
    });
    return response.data;
  },

  async getPurchases(params?: { skip?: number; limit?: number; search?: string }): Promise<{
    items: AdidasComparisonPurchase[];
    total: number;
  }> {
    const response = await api.get('/adidas-comparison/purchases', { params });
    return response.data;
  },

  async getSales(params?: { skip?: number; limit?: number; search?: string }): Promise<{
    items: AdidasComparisonSale[];
    total: number;
  }> {
    const response = await api.get('/adidas-comparison/sales', { params });
    return response.data;
  },

  async getStats(): Promise<AdidasComparisonStats> {
    const response = await api.get('/adidas-comparison/stats');
    return response.data;
  },

  async addPurchase(data: AdidasComparisonPurchaseCreate): Promise<AdidasComparisonPurchase> {
    const response = await api.post('/adidas-comparison/purchases', data);
    return response.data;
  },

  async deletePurchase(id: string): Promise<void> {
    await api.delete(`/adidas-comparison/purchases/${id}`);
  },

  async deleteAll(): Promise<{ message: string }> {
    const response = await api.delete('/adidas-comparison/all');
    return response.data;
  },
};
