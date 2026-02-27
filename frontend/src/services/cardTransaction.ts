import api from './api';
import {
  CardTransactionList,
  CardTransactionStats,
  CodefSettingList,
  SyncRequest,
  SyncResponse,
  CardListResponse,
  OrganizationInfo,
  AccountRegisterRequest,
  AccountRegisterResponse,
  ConnectedAccountListResponse,
  CodefAccountListResponse,
  ApiUsageStats,
} from '../types/cardTransaction';

export const cardTransactionService = {
  // 카드 내역 목록 조회
  async getTransactions(params?: {
    skip?: number;
    limit?: number;
    start_date?: string;
    end_date?: string;
    organization?: string;
    search?: string;
    payment_type?: string;
    cancel_status?: string;
    owner_name?: string;
    client_type?: string;
  }): Promise<CardTransactionList> {
    const response = await api.get('/card-transactions', { params });
    return response.data;
  },

  // 카드 내역 통계
  async getStats(params?: {
    start_date?: string;
    end_date?: string;
    organization?: string;
  }): Promise<CardTransactionStats> {
    const response = await api.get('/card-transactions/stats', { params });
    return response.data;
  },

  // 지원 카드사 목록
  async getOrganizations(): Promise<OrganizationInfo[]> {
    const response = await api.get('/card-transactions/organizations');
    return response.data;
  },

  // 카드 내역 상세
  async getTransaction(id: string): Promise<any> {
    const response = await api.get(`/card-transactions/${id}`);
    return response.data;
  },

  // 카드 내역 삭제
  async deleteTransaction(id: string): Promise<void> {
    await api.delete(`/card-transactions/${id}`);
  },

  // 카드 내역 일괄 삭제
  async deleteTransactionsBatch(ids: string[]): Promise<{ message: string; deleted_count: number }> {
    const response = await api.post('/card-transactions/delete-batch', { ids });
    return response.data;
  },

  // CODEF 동기화
  async syncTransactions(data: SyncRequest): Promise<SyncResponse> {
    const response = await api.post('/card-transactions/sync', data);
    return response.data;
  },

  // 보유카드 목록 조회
  async getCardList(organization: string): Promise<CardListResponse> {
    const response = await api.get(`/card-transactions/cards/${organization}`);
    return response.data;
  },

  // CODEF 설정 조회
  async getSettings(): Promise<CodefSettingList> {
    const response = await api.get('/card-transactions/settings/codef');
    return response.data;
  },

  // CODEF 설정 업데이트
  async updateSettings(settings: Record<string, string>): Promise<CodefSettingList> {
    const response = await api.put('/card-transactions/settings/codef', { settings });
    return response.data;
  },

  // 카드사 계정 연동
  async registerAccount(data: AccountRegisterRequest): Promise<AccountRegisterResponse> {
    const response = await api.post('/card-transactions/account/register', data);
    return response.data;
  },

  // 연결된 계정 목록 조회
  async getConnectedAccounts(): Promise<ConnectedAccountListResponse> {
    const response = await api.get('/card-transactions/account/list');
    return response.data;
  },

  // 카드사별 계정 정보 조회 (저장된 로그인 ID + 연결 상태)
  async getAccountInfo(): Promise<CodefAccountListResponse> {
    const response = await api.get('/card-transactions/account/info');
    return response.data;
  },

  // 카드사 계정 정보 저장 (연동 없이 로그인 ID만 저장)
  async saveAccountInfo(data: { organization: string; login_id?: string; card_no?: string; owner_name?: string }): Promise<void> {
    await api.put('/card-transactions/account/info', data);
  },

  // 카드사 계정 연동 해제
  async deleteAccount(organization: string, clientType: string = 'P'): Promise<{ message: string }> {
    const response = await api.delete(`/card-transactions/account/${organization}`, { params: { client_type: clientType } });
    return response.data;
  },

  // CODEF API 호출 현황 조회
  async getApiUsage(): Promise<ApiUsageStats> {
    const response = await api.get('/card-transactions/api-usage');
    return response.data;
  },
};
