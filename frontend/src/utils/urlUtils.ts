/**
 * API Base URL을 반환
 * - 환경변수가 설정되어 있으면 해당 URL 사용 (개발 모드)
 * - 없으면 빈 문자열 (nginx를 통한 상대 경로)
 */
export const getApiBaseUrl = (): string => {
  return process.env.REACT_APP_API_URL || '';
};

/**
 * 이미지나 파일 URL을 생성
 * - 절대 URL(http/https)이면 그대로 반환
 * - 상대 경로면 현재 origin + 경로 반환
 */
export const getFileUrl = (path?: string | null): string | null => {
  if (!path) return null;

  // 이미 절대 URL이면 그대로 반환
  if (path.startsWith('http://') || path.startsWith('https://')) {
    return path;
  }

  // 상대 경로면 현재 origin 추가
  // window.location.origin은 브라우저가 접속한 도메인 (ngrok URL 포함)
  const origin = window.location.origin;
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  
  return `${origin}${normalizedPath}`;
};
