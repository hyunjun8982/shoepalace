import api from './api';
import { User } from '../types';
import { UserCreate, UserUpdate } from '../types/user';

export const userService = {
  // 사용자 목록 조회
  getUsers: async (params?: {
    skip?: number;
    limit?: number;
    search?: string;
    role?: string;
    is_active?: boolean;
  }) => {
    const response = await api.get<User[]>('/users', { params });
    return response.data;
  },

  // 사용자 상세 조회
  getUser: async (id: string) => {
    const response = await api.get<User>(`/users/${id}`);
    return response.data;
  },

  // 사용자 생성
  createUser: async (userData: UserCreate) => {
    const response = await api.post<User>('/users', userData);
    return response.data;
  },

  // 사용자 수정
  updateUser: async (id: string, userData: UserUpdate) => {
    const response = await api.put<User>(`/users/${id}`, userData);
    return response.data;
  },

  // 사용자 삭제
  deleteUser: async (id: string) => {
    const response = await api.delete(`/users/${id}`);
    return response.data;
  },

  // 비밀번호 변경
  changePassword: async (id: string, currentPassword: string, newPassword: string) => {
    const response = await api.post(`/users/${id}/change-password`, null, {
      params: { current_password: currentPassword, new_password: newPassword }
    });
    return response.data;
  },

  // 회원가입
  register: async (userData: UserCreate) => {
    const response = await api.post<User>('/users/register', userData);
    return response.data;
  },
};