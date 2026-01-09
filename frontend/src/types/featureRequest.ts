export type RequestStatus = 'pending' | 'in_progress' | 'completed' | 'rejected';

export interface FeatureRequest {
  id: string;
  title: string;
  content: string;
  status: RequestStatus;
  version?: string;
  author_id?: string;
  author_name?: string;
  admin_note?: string;
  created_at: string;
  updated_at: string;
}

export interface FeatureRequestCreate {
  title: string;
  content?: string;
  author_name?: string;
}

export interface FeatureRequestUpdate {
  title?: string;
  content?: string;
  status?: RequestStatus;
  version?: string;
  admin_note?: string;
}

export interface FeatureRequestListResponse {
  items: FeatureRequest[];
  total: number;
}

export const REQUEST_STATUS_LABELS: Record<RequestStatus, string> = {
  pending: '대기',
  in_progress: '진행중',
  completed: '완료',
  rejected: '반려',
};

export const REQUEST_STATUS_COLORS: Record<RequestStatus, string> = {
  pending: 'default',
  in_progress: 'processing',
  completed: 'success',
  rejected: 'error',
};
