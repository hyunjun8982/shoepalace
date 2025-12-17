/**
 * 채팅 관련 타입 정의
 */

export enum RoomType {
  GENERAL = 'general',
  DIRECT = 'direct',
  GROUP = 'group',
  PURCHASE = 'purchase',
  SALE = 'sale',
  PRODUCT = 'product',
}

export interface ChatUser {
  id: string;
  full_name: string;
  email: string;
}

export interface ChatParticipant {
  id: string;
  user_id: string;
  user: ChatUser;
  is_admin: boolean;
  is_muted: boolean;
  last_read_at?: string;
  joined_at: string;
}

export interface ChatMessage {
  id: string;
  room_id: string;
  user_id: string;
  user: ChatUser;
  message: string;
  is_system: boolean;
  created_at: string;
  updated_at?: string;
  read_count: number;
}

export interface ChatRoom {
  id: string;
  name?: string;
  type: RoomType;
  description?: string;
  is_active: boolean;
  created_by?: string;
  creator?: ChatUser;
  created_at: string;
  updated_at?: string;

  // 연관 정보
  purchase_id?: string;
  sale_id?: string;
  product_id?: string;

  // 참여자 및 메시지
  participants: ChatParticipant[];
  last_message?: ChatMessage;
  unread_count: number;
}

export interface ChatRoomCreate {
  name?: string;
  type: RoomType;
  description?: string;
  purchase_id?: string;
  sale_id?: string;
  product_id?: string;
  participant_ids: string[];
}

export interface ChatMessageCreate {
  message: string;
}

export interface ChatRoomListResponse {
  rooms: ChatRoom[];
  total: number;
}

export interface ChatMessageListResponse {
  messages: ChatMessage[];
  total: number;
}

// WebSocket 메시지
export enum WSMessageType {
  CONNECT = 'connect',
  DISCONNECT = 'disconnect',
  MESSAGE = 'message',
  TYPING = 'typing',
  READ = 'read',
  ERROR = 'error',
}

export interface WSMessage {
  type: WSMessageType;
  room_id: string;
  data: any;
}
