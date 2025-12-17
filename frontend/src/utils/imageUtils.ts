import { getFileUrl } from './urlUtils';

/**
 * 브랜드 아이콘 URL을 전체 URL로 변환
 * @param iconUrl 데이터베이스에 저장된 icon_url (예: /uploads/brands/nike.png)
 * @returns 전체 URL (예: http://localhost/uploads/brands/nike.png 또는 https://xxx.ngrok.io/uploads/brands/nike.png)
 */
export const getBrandIconUrl = (iconUrl?: string | null): string | null => {
  return getFileUrl(iconUrl);
};
