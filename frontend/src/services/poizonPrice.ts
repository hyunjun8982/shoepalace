import api from './api';
import type {
  PoizonPriceWatchListResponse,
  PoizonPriceRefreshStatus,
} from '../types/poizonPrice';

export const poizonPriceService = {
  async getItems(): Promise<PoizonPriceWatchListResponse> {
    const response = await api.get('/poizon-price/items');
    return response.data;
  },

  async addItems(items: { article_number: string; sell_price?: number | null }[]): Promise<{ message: string; added: number; updated: number }> {
    const response = await api.post('/poizon-price/items', { items });
    return response.data;
  },

  async deleteItem(articleNumber: string): Promise<void> {
    await api.delete(`/poizon-price/items/${articleNumber}`);
  },

  async deleteAll(): Promise<{ message: string }> {
    const response = await api.delete('/poizon-price/items');
    return response.data;
  },

  async refreshPrices(articleNumbers?: string[]): Promise<{ message: string }> {
    const response = await api.post('/poizon-price/refresh', {
      article_numbers: articleNumbers || null,
    });
    return response.data;
  },

  async getRefreshStatus(): Promise<PoizonPriceRefreshStatus> {
    const response = await api.get('/poizon-price/refresh-status');
    return response.data;
  },

};
