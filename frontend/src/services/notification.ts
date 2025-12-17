import axios from 'axios';
import { Notification, NotificationListResponse } from '../types/notification';

const API_URL = process.env.REACT_APP_API_URL || '';

export const notificationService = {
  /**
   * 알림 목록 조회
   */
  async getNotifications(params?: {
    skip?: number;
    limit?: number;
    unread_only?: boolean;
  }): Promise<NotificationListResponse> {
    const response = await axios.get(`${API_URL}/api/v1/notifications`, {
      params,
      headers: {
        Authorization: `Bearer ${localStorage.getItem('token')}`,
      },
    });
    return response.data;
  },

  /**
   * 읽지 않은 알림 개수 조회
   */
  async getUnreadCount(): Promise<number> {
    const response = await axios.get(`${API_URL}/api/v1/notifications/unread-count`, {
      headers: {
        Authorization: `Bearer ${localStorage.getItem('token')}`,
      },
    });
    return response.data.count;
  },

  /**
   * 알림 읽음 처리
   */
  async markAsRead(notificationId: string): Promise<Notification> {
    const response = await axios.patch(
      `${API_URL}/api/v1/notifications/${notificationId}`,
      { is_read: true },
      {
        headers: {
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
      }
    );
    return response.data;
  },

  /**
   * 모든 알림 읽음 처리
   */
  async markAllAsRead(): Promise<void> {
    await axios.post(
      `${API_URL}/api/v1/notifications/mark-all-read`,
      {},
      {
        headers: {
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
      }
    );
  },

  /**
   * 알림 삭제
   */
  async deleteNotification(notificationId: string): Promise<void> {
    await axios.delete(`${API_URL}/api/v1/notifications/${notificationId}`, {
      headers: {
        Authorization: `Bearer ${localStorage.getItem('token')}`,
      },
    });
  },
};
