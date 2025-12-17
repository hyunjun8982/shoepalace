import api from './api';
import {
  Settlement,
  SettlementListParams,
  SettlementListResponse,
  SettlementSummary,
  CalculateSettlementParams,
} from '../types/settlement';

export const settlementService = {
  // 정산 목록 조회
  async getSettlements(params?: SettlementListParams): Promise<SettlementListResponse> {
    const response = await api.get('/settlements', { params });
    return response.data;
  },

  // 정산 요약 정보 조회
  async getSettlementSummary(startDate?: string, endDate?: string): Promise<SettlementSummary> {
    const params: any = {};
    if (startDate) params.start_date = startDate;
    if (endDate) params.end_date = endDate;
    const response = await api.get('/settlements/summary', { params });
    return response.data;
  },

  // 정산 상세 조회
  async getSettlement(settlementId: string): Promise<Settlement> {
    const response = await api.get(`/settlements/${settlementId}`);
    return response.data;
  },

  // 정산 생성
  async createSettlement(settlement: Settlement): Promise<Settlement> {
    const response = await api.post('/settlements', settlement);
    return response.data;
  },

  // 정산 자동 계산
  async calculateSettlement(params: CalculateSettlementParams): Promise<Settlement> {
    const response = await api.post('/settlements/calculate', null, { params });
    return response.data;
  },

  // 정산 수정
  async updateSettlement(settlementId: string, settlement: Partial<Settlement>): Promise<Settlement> {
    const response = await api.put(`/settlements/${settlementId}`, settlement);
    return response.data;
  },

  // 정산 삭제
  async deleteSettlement(settlementId: string): Promise<void> {
    await api.delete(`/settlements/${settlementId}`);
  },
};