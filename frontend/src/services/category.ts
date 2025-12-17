import api from './api';

export interface Category {
  id: string;
  name: string;
  name_kr: string;
  description?: string;
  icon?: string;
  is_active: boolean;
  display_order: number;
  created_at: string;
  updated_at: string;
}

export interface CategoryListResponse {
  total: number;
  items: Category[];
}

export const categoryService = {
  getCategories: async (): Promise<CategoryListResponse> => {
    const response = await api.get<CategoryListResponse>('/categories/');
    return response.data;
  },
};
