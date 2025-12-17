"""
Chat Schemas
채팅 관련 Pydantic 스키마
"""

from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime
from enum import Enum
from uuid import UUID


class RoomType(str, Enum):
    """채팅방 타입"""
    GENERAL = "general"
    DIRECT = "direct"
    GROUP = "group"
    PURCHASE = "purchase"
    SALE = "sale"
    PRODUCT = "product"


# User 정보 (간단)
class ChatUserInfo(BaseModel):
    id: UUID
    full_name: str
    email: str

    class Config:
        from_attributes = True


# 채팅방 생성
class ChatRoomCreate(BaseModel):
    name: Optional[str] = None
    type: RoomType
    description: Optional[str] = None
    purchase_id: Optional[UUID] = None
    sale_id: Optional[UUID] = None
    product_id: Optional[UUID] = None
    participant_ids: List[UUID] = []  # 초대할 사용자 ID 목록


# 채팅방 업데이트
class ChatRoomUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    is_active: Optional[bool] = None


# 채팅방 참여자
class ChatParticipantResponse(BaseModel):
    id: UUID
    user_id: UUID
    user: ChatUserInfo
    is_admin: bool
    is_muted: bool
    last_read_at: Optional[datetime] = None
    joined_at: datetime

    class Config:
        from_attributes = True


# 메시지 생성
class ChatMessageCreate(BaseModel):
    message: str = Field(..., min_length=1, max_length=5000)


# 메시지 응답
class ChatMessageResponse(BaseModel):
    id: UUID
    room_id: UUID
    user_id: UUID
    user: ChatUserInfo
    message: str
    is_system: bool
    created_at: datetime
    updated_at: Optional[datetime] = None
    read_count: int = 0  # 읽은 사람 수

    class Config:
        from_attributes = True


# 채팅방 응답
class ChatRoomResponse(BaseModel):
    id: UUID
    name: Optional[str] = None
    type: RoomType
    description: Optional[str] = None
    is_active: bool
    created_by: Optional[UUID] = None
    creator: Optional[ChatUserInfo] = None
    created_at: datetime
    updated_at: Optional[datetime] = None

    # 연관 정보
    purchase_id: Optional[UUID] = None
    sale_id: Optional[UUID] = None
    product_id: Optional[UUID] = None

    # 참여자 및 메시지
    participants: List[ChatParticipantResponse] = []
    last_message: Optional[ChatMessageResponse] = None
    unread_count: int = 0  # 읽지 않은 메시지 수

    class Config:
        from_attributes = True


# 채팅방 목록 응답
class ChatRoomListResponse(BaseModel):
    rooms: List[ChatRoomResponse]
    total: int


# 메시지 목록 응답
class ChatMessageListResponse(BaseModel):
    messages: List[ChatMessageResponse]
    total: int


# WebSocket 메시지 타입
class WSMessageType(str, Enum):
    CONNECT = "connect"
    DISCONNECT = "disconnect"
    MESSAGE = "message"
    TYPING = "typing"
    READ = "read"
    ERROR = "error"


# WebSocket 메시지
class WSMessage(BaseModel):
    type: WSMessageType
    room_id: UUID
    data: dict
