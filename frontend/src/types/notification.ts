export enum NotificationType {
  STOCK_OUT = 'stock_out',
  STOCK_LOW = 'stock_low',
}

export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  product_id?: string;
  product_name?: string;
  product_code?: string;
  product_image_url?: string;
  size?: string;
  previous_quantity?: string;
  current_quantity?: string;
  is_read: boolean;
  created_at: string;
  read_at?: string;
}

export interface NotificationListResponse {
  items: Notification[];
  total: number;
  unread_count: number;
}
