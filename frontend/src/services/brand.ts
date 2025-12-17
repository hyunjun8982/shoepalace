import api from './api';

export interface Brand {
  id: string;
  name: string;
  description?: string;
  icon_url?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface BrandListResponse {
  total: number;
  items: Brand[];
}

export const brandService = {
  getBrands: async (): Promise<BrandListResponse> => {
    const response = await api.get<BrandListResponse>('/brands/');
    return response.data;
  },

  createBrand: async (name: string, description: string | null, icon: File | null): Promise<Brand> => {
    const formData = new FormData();
    formData.append('name', name);
    if (description) {
      formData.append('description', description);
    }
    if (icon) {
      formData.append('icon', icon);
    }

    const response = await api.post<Brand>('/brands/', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  },

  updateBrand: async (
    brandId: string,
    name: string | null,
    description: string | null,
    icon: File | null
  ): Promise<Brand> => {
    const formData = new FormData();
    if (name) {
      formData.append('name', name);
    }
    if (description !== null) {
      formData.append('description', description);
    }
    if (icon) {
      formData.append('icon', icon);
    }

    const response = await api.put<Brand>(`/brands/${brandId}`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  },

  deleteBrand: async (brandId: string): Promise<void> => {
    await api.delete(`/brands/${brandId}`);
  },
};
