import apiClient from './api';
import { Warehouse, WarehouseCreate, WarehouseUpdate, WarehouseList } from '../types/warehouse';

export const warehouseService = {
  // 창고 목록 조회
  getWarehouses: async (params?: {
    skip?: number;
    limit?: number;
    is_active?: boolean;
    search?: string;
  }): Promise<WarehouseList> => {
    const response = await apiClient.get('/warehouses/', { params });
    return response.data;
  },

  // 창고 상세 조회
  getWarehouse: async (id: string): Promise<Warehouse> => {
    const response = await apiClient.get(`/warehouses/${id}`);
    return response.data;
  },

  // 창고 생성
  createWarehouse: async (data: WarehouseCreate): Promise<Warehouse> => {
    const response = await apiClient.post('/warehouses/', data);
    return response.data;
  },

  // 창고 수정
  updateWarehouse: async (id: string, data: WarehouseUpdate): Promise<Warehouse> => {
    const response = await apiClient.put(`/warehouses/${id}`, data);
    return response.data;
  },

  // 창고 삭제
  deleteWarehouse: async (id: string): Promise<void> => {
    await apiClient.delete(`/warehouses/${id}`);
  },


  // 다음 창고 코드 조회
  getNextWarehouseCode: async (): Promise<{ warehouse_code: string }> => {
    const response = await apiClient.get('/warehouses/next-code');
    return response.data;
  },

  // 창고별 재고 조회
  getWarehouseInventory: async (id: string): Promise<any> => {
    const response = await apiClient.get(`/warehouses/${id}/inventory`);
    return response.data;
  },
  // 창고 이미지 업로드
  uploadImage: async (id: string, file: File): Promise<{ image_url: string }> => {
    const formData = new FormData();
    formData.append('file', file);

    const response = await apiClient.post(`/warehouses/${id}/upload-image`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  },
};

export type { Warehouse, WarehouseCreate, WarehouseUpdate };
