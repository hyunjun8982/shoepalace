import axios from 'axios';
import {
  FeatureRequest,
  FeatureRequestCreate,
  FeatureRequestUpdate,
  FeatureRequestListResponse,
  RequestStatus,
} from '../types/featureRequest';

const API_URL = process.env.REACT_APP_API_URL || '';

export const featureRequestService = {
  /**
   * 요청사항 목록 조회
   */
  async getList(params?: {
    skip?: number;
    limit?: number;
    status?: RequestStatus;
  }): Promise<FeatureRequestListResponse> {
    const response = await axios.get(`${API_URL}/api/v1/feature-requests`, {
      params,
      headers: {
        Authorization: `Bearer ${localStorage.getItem('token')}`,
      },
    });
    return response.data;
  },

  /**
   * 요청사항 상세 조회
   */
  async getById(id: string): Promise<FeatureRequest> {
    const response = await axios.get(`${API_URL}/api/v1/feature-requests/${id}`, {
      headers: {
        Authorization: `Bearer ${localStorage.getItem('token')}`,
      },
    });
    return response.data;
  },

  /**
   * 요청사항 등록
   */
  async create(data: FeatureRequestCreate): Promise<FeatureRequest> {
    const response = await axios.post(`${API_URL}/api/v1/feature-requests`, data, {
      headers: {
        Authorization: `Bearer ${localStorage.getItem('token')}`,
      },
    });
    return response.data;
  },

  /**
   * 요청사항 수정
   */
  async update(id: string, data: FeatureRequestUpdate): Promise<FeatureRequest> {
    const response = await axios.patch(`${API_URL}/api/v1/feature-requests/${id}`, data, {
      headers: {
        Authorization: `Bearer ${localStorage.getItem('token')}`,
      },
    });
    return response.data;
  },

  /**
   * 요청사항 삭제
   */
  async delete(id: string): Promise<void> {
    await axios.delete(`${API_URL}/api/v1/feature-requests/${id}`, {
      headers: {
        Authorization: `Bearer ${localStorage.getItem('token')}`,
      },
    });
  },
};
