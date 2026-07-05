import api from './api';
import { Card, CardCreate, CardUpdate } from '../types/card';

const BASE_URL = '/cards';

export const cardService = {
  // 카드 목록 조회
  async getCards(params?: { skip?: number; limit?: number; is_active?: boolean }) {
    const response = await api.get<{ items: Card[]; total: number }>(BASE_URL, { params });
    return response.data;
  },

  // 카드 상세 조회
  async getCard(id: string) {
    const response = await api.get<Card>(`${BASE_URL}/${id}`);
    return response.data;
  },

  // 카드 생성
  async createCard(data: CardCreate) {
    const response = await api.post<Card>(BASE_URL, data);
    return response.data;
  },

  // 카드 수정
  async updateCard(id: string, data: CardUpdate) {
    const response = await api.put<Card>(`${BASE_URL}/${id}`, data);
    return response.data;
  },

  // 카드 삭제
  async deleteCard(id: string) {
    const response = await api.delete<{ message: string }>(`${BASE_URL}/${id}`);
    return response.data;
  },
};
