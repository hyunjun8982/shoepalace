import axios, { AxiosResponse } from 'axios';

// API 기본 설정
// baseURL을 사용하지 않고 모든 요청을 상대 경로로만 처리
const api = axios.create({
  timeout: 300000, // 5분 (대량 저장을 위해 증가)
});

// 요청 인터셉터: URL 변환, 토큰 자동 첨부
api.interceptors.request.use(
  (config) => {
    // 환경변수가 있으면 절대 경로 사용 (개발 모드)
    const API_BASE_URL = process.env.REACT_APP_API_URL;

    if (API_BASE_URL) {
      // 개발 모드: 환경변수의 절대 URL 사용
      config.url = `${API_BASE_URL}/api/v1${config.url}`;
    } else {
      // 프로덕션 모드 (nginx): 상대 경로 사용
      config.url = `/api/v1${config.url}`;
    }

    const token = localStorage.getItem('access_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    // FormData나 URLSearchParams가 아닌 경우에만 Content-Type을 application/json으로 설정
    if (!(config.data instanceof FormData) && !(config.data instanceof URLSearchParams)) {
      config.headers['Content-Type'] = 'application/json';
    }

    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// 응답 인터셉터: 에러 처리
api.interceptors.response.use(
  (response: AxiosResponse) => {
    return response;
  },
  (error) => {
    if (error.response?.status === 401) {
      // 토큰 만료 또는 인증 실패
      localStorage.removeItem('access_token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default api;
