import api from './api';
import {
  BankTransactionList,
  BankTransactionStats,
  BankTransactionSyncRequest,
  BankTransactionSyncResponse,
} from '../types/bankTransaction';

export const bankTransactionService = {
  // 은행 거래내역 목록 조회
  async getTransactions(params?: {
    skip?: number;
    limit?: number;
    start_date?: string;
    end_date?: string;
    organization?: string;
    search?: string;
    owner_name?: string;
    account_no?: string;
  }): Promise<BankTransactionList> {
    const response = await api.get('/bank-transactions', { params });
    return response.data;
  },

  // 은행 거래내역 통계
  async getStats(params?: {
    start_date?: string;
    end_date?: string;
    organization?: string;
  }): Promise<BankTransactionStats> {
    const response = await api.get('/bank-transactions/stats', { params });
    return response.data;
  },

  // 지원 은행 목록
  async getOrganizations(): Promise<{ code: string; name: string }[]> {
    const response = await api.get('/bank-transactions/organizations');
    return response.data;
  },

  // 거래내역 상세
  async getTransaction(id: string): Promise<any> {
    const response = await api.get(`/bank-transactions/${id}`);
    return response.data;
  },

  // 거래내역 삭제
  async deleteTransaction(id: string): Promise<void> {
    await api.delete(`/bank-transactions/${id}`);
  },

  // 거래내역 일괄 삭제
  async deleteTransactionsBatch(ids: string[]): Promise<{ message: string; deleted_count: number }> {
    const response = await api.post('/bank-transactions/delete-batch', { ids });
    return response.data;
  },

  // CODEF 동기화
  async syncTransactions(data: BankTransactionSyncRequest): Promise<BankTransactionSyncResponse> {
    const response = await api.post('/bank-transactions/sync', data);
    return response.data;
  },

  // 은행별 계정 정보 조회
  async getAccountInfo(): Promise<{ accounts: any[] }> {
    const response = await api.get('/bank-transactions/account/info');
    return response.data;
  },

  // 은행 계정 정보 저장 (계좌번호 등)
  async saveAccountInfo(data: { organization: string; client_type: string; account_no?: string }): Promise<void> {
    await api.put('/bank-transactions/account/info', data);
  },
};
