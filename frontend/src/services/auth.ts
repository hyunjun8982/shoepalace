import api from './api';
import { LoginForm, AuthToken, User } from '../types';

export const authService = {
  // 로그인
  async login(credentials: LoginForm): Promise<AuthToken> {
    const formData = new URLSearchParams();
    formData.append('username', credentials.username);
    formData.append('password', credentials.password);

    const response = await api.post<AuthToken>('/auth/login', formData, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });

    // 토큰을 로컬스토리지에 저장
    localStorage.setItem('access_token', response.data.access_token);

    return response.data;
  },

  // 현재 사용자 정보 조회
  async getCurrentUser(): Promise<User> {
    const response = await api.get<User>('/auth/me');

    // 사용자 정보를 로컬스토리지에 저장
    localStorage.setItem('user', JSON.stringify(response.data));

    return response.data;
  },

  // 로그아웃
  logout(): void {
    localStorage.removeItem('access_token');
    localStorage.removeItem('user');
    window.location.href = '/login';
  },

  // 토큰 확인
  getToken(): string | null {
    return localStorage.getItem('access_token');
  },

  // 저장된 사용자 정보 가져오기
  getUser(): User | null {
    const userStr = localStorage.getItem('user');
    return userStr ? JSON.parse(userStr) : null;
  },

  // 인증 상태 확인
  isAuthenticated(): boolean {
    const token = this.getToken();
    const user = this.getUser();
    return !!(token && user);
  },

  // 권한 확인
  hasRole(role: string): boolean {
    const user = this.getUser();
    return user?.role === role || user?.role === 'admin';
  },
};