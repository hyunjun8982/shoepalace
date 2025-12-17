import api from './api';
import { AdidasAccount, AdidasAccountCreate, AdidasAccountInfo, CouponStatus } from '../types/adidasAccount';

export const adidasAccountService = {
  // 계정 목록 조회
  getAccounts: async (): Promise<AdidasAccount[]> => {
    const response = await api.get('/adidas-accounts/');
    return response.data;
  },

  // 계정 상세 조회
  getAccount: async (id: string): Promise<AdidasAccount> => {
    const response = await api.get(`/adidas-accounts/${id}`);
    return response.data;
  },

  // 계정 추가
  createAccount: async (data: AdidasAccountCreate): Promise<AdidasAccount> => {
    const response = await api.post('/adidas-accounts/', data);
    return response.data;
  },

  // 계정 수정
  updateAccount: async (id: string, data: Partial<AdidasAccountCreate>): Promise<AdidasAccount> => {
    const response = await api.put(`/adidas-accounts/${id}`, data);
    return response.data;
  },

  // 계정 삭제
  deleteAccount: async (id: string): Promise<void> => {
    await api.delete(`/adidas-accounts/${id}`);
  },

  // 마이페이지 정보 가져오기
  fetchAccountInfo: async (id: string): Promise<AdidasAccountInfo> => {
    const response = await api.post(`/adidas-accounts/${id}/fetch-info`);
    return response.data;
  },

  // 쿠폰 조회
  checkCoupons: async (id: string): Promise<CouponStatus> => {
    const response = await api.post(`/adidas-accounts/${id}/check-coupons`);
    return response.data;
  },

  // 쿠폰 발급
  issueCoupon: async (id: string, couponType: string): Promise<any> => {
    const response = await api.post(`/adidas-accounts/${id}/issue-coupon?coupon_type=${couponType}`);
    return response.data;
  },
};
