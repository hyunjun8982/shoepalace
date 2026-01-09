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
 * - 상대 경로면 API 서버 origin + 경로 반환
 */
export const getFileUrl = (path?: string | null): string | null => {
  if (!path) return null;

  // 이미 절대 URL이면 그대로 반환
  if (path.startsWith('http://') || path.startsWith('https://')) {
    return path;
  }

  const normalizedPath = path.startsWith('/') ? path : `/${path}`;

  // 환경변수에 API URL이 설정되어 있으면 사용 (개발 모드)
  const apiUrl = process.env.REACT_APP_API_URL;
  if (apiUrl) {
    return `${apiUrl}${normalizedPath}`;
  }

  // 프로덕션 또는 nginx 프록시 환경: 현재 origin 사용
  // 개발 환경에서 포트가 3000/3001이면 8000으로 변경 (백엔드 포트)
  let origin = window.location.origin;
  if (origin.includes(':3000')) {
    origin = origin.replace(':3000', ':8000');
  } else if (origin.includes(':3001')) {
    origin = origin.replace(':3001', ':8000');
  }

  return `${origin}${normalizedPath}`;
};
