/**
 * 채팅 서비스
 */

import axios from 'axios';
import {
  ChatRoom,
  ChatRoomCreate,
  ChatRoomListResponse,
  ChatMessage,
  ChatMessageCreate,
  ChatMessageListResponse,
  RoomType,
} from '../types/chat';

const API_BASE_URL = process.env.REACT_APP_API_URL || '/api/v1';

// Axios 인스턴스 생성
const chatApi = axios.create({
  baseURL: `${API_BASE_URL}/chat`,
});

// 요청 인터셉터: 토큰 추가
chatApi.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export const chatService = {
  /**
   * 채팅방 목록 조회
   */
  async getRooms(type?: RoomType, skip = 0, limit = 100): Promise<ChatRoomListResponse> {
    const params: any = { skip, limit };
    if (type) {
      params.type = type;
    }
    const response = await chatApi.get<ChatRoomListResponse>('/rooms', { params });
    return response.data;
  },

  /**
   * 채팅방 생성
   */
  async createRoom(data: ChatRoomCreate): Promise<ChatRoom> {
    const response = await chatApi.post<ChatRoom>('/rooms', data);
    return response.data;
  },

  /**
   * 채팅방 상세 조회
   */
  async getRoom(roomId: string): Promise<ChatRoom> {
    const response = await chatApi.get<ChatRoom>(`/rooms/${roomId}`);
    return response.data;
  },

  /**
   * 메시지 목록 조회
   */
  async getMessages(
    roomId: string,
    skip = 0,
    limit = 50
  ): Promise<ChatMessageListResponse> {
    const response = await chatApi.get<ChatMessageListResponse>(
      `/rooms/${roomId}/messages`,
      {
        params: { skip, limit },
      }
    );
    return response.data;
  },

  /**
   * 메시지 전송
   */
  async sendMessage(roomId: string, data: ChatMessageCreate): Promise<ChatMessage> {
    const response = await chatApi.post<ChatMessage>(`/rooms/${roomId}/messages`, data);
    return response.data;
  },

  /**
   * 메시지 읽음 처리
   */
  async markAsRead(roomId: string): Promise<void> {
    await chatApi.post(`/rooms/${roomId}/read`);
  },

  /**
   * 채팅방 나가기
   */
  async leaveRoom(roomId: string): Promise<void> {
    await chatApi.post(`/rooms/${roomId}/leave`);
  },

  /**
   * WebSocket 연결
   */
  connectWebSocket(roomId: string, token: string): WebSocket {
    // WebSocket URL 구성 (상대 경로를 절대 경로로 변환)
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const wsUrl = `${protocol}//${host}/api/v1/chat/ws/${roomId}?token=${token}`;
    console.log('Connecting to WebSocket:', wsUrl);
    const ws = new WebSocket(wsUrl);
    return ws;
  },
};
