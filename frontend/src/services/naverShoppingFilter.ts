import apiClient from './api';

export interface NaverFilter {
  id: number;
  mall_name: string;
  created_at: string;
}

export interface FilterCreateRequest {
  mall_name: string;
}

class NaverShoppingFilterService {
  /**
   * 필터 목록 조회
   */
  async getFilters(): Promise<NaverFilter[]> {
    const response = await apiClient.get<NaverFilter[]>('/naver-shopping/filters');
    return response.data;
  }

  /**
   * 필터 추가
   */
  async createFilter(data: FilterCreateRequest): Promise<NaverFilter> {
    const response = await apiClient.post<NaverFilter>('/naver-shopping/filters', data);
    return response.data;
  }

  /**
   * 필터 삭제
   */
  async deleteFilter(filterId: number): Promise<{ message: string }> {
    const response = await apiClient.delete<{ message: string }>(`/naver-shopping/filters/${filterId}`);
    return response.data;
  }
}

export const naverShoppingFilterService = new NaverShoppingFilterService();
