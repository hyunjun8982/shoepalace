"""
Chat Models
채팅 관련 데이터베이스 모델
"""

from sqlalchemy import Column, String, Text, Boolean, DateTime, ForeignKey, Enum as SQLEnum, Integer
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import enum
import uuid

from app.db.database import Base


class RoomType(str, enum.Enum):
    """채팅방 타입"""
    GENERAL = "general"  # 전체 채팅
    DIRECT = "direct"  # 1:1 다이렉트 메시지
    GROUP = "group"  # 그룹 채팅
    PURCHASE = "purchase"  # 구매 건 채팅
    SALE = "sale"  # 판매 건 채팅
    PRODUCT = "product"  # 상품 관련 채팅


class ChatRoom(Base):
    """채팅방"""
    __tablename__ = "chat_rooms"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(200), nullable=True)  # 채팅방 이름 (그룹채팅용)
    type = Column(SQLEnum(RoomType), nullable=False, default=RoomType.GENERAL)

    # 연관 엔티티 (구매/판매/상품 등)
    purchase_id = Column(UUID(as_uuid=True), ForeignKey("purchases.id"), nullable=True)
    sale_id = Column(UUID(as_uuid=True), ForeignKey("sales.id"), nullable=True)
    product_id = Column(UUID(as_uuid=True), ForeignKey("products.id"), nullable=True)

    # 메타 정보
    description = Column(Text, nullable=True)
    is_active = Column(Boolean, default=True)
    created_by = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    messages = relationship("ChatMessage", back_populates="room", cascade="all, delete-orphan")
    participants = relationship("ChatParticipant", back_populates="room", cascade="all, delete-orphan")
    creator = relationship("User", foreign_keys=[created_by])
    purchase = relationship("Purchase", foreign_keys=[purchase_id])
    sale = relationship("Sale", foreign_keys=[sale_id])
    product = relationship("Product", foreign_keys=[product_id])


class ChatMessage(Base):
    """채팅 메시지"""
    __tablename__ = "chat_messages"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    room_id = Column(UUID(as_uuid=True), ForeignKey("chat_rooms.id"), nullable=False)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)

    message = Column(Text, nullable=False)
    is_system = Column(Boolean, default=False)  # 시스템 메시지 여부

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    room = relationship("ChatRoom", back_populates="messages")
    user = relationship("User")
    read_receipts = relationship("MessageReadReceipt", back_populates="message", cascade="all, delete-orphan")


class ChatParticipant(Base):
    """채팅방 참여자"""
    __tablename__ = "chat_participants"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    room_id = Column(UUID(as_uuid=True), ForeignKey("chat_rooms.id"), nullable=False)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)

    is_admin = Column(Boolean, default=False)  # 방장 여부
    is_muted = Column(Boolean, default=False)  # 알림 음소거
    last_read_at = Column(DateTime(timezone=True), nullable=True)  # 마지막 읽은 시간

    joined_at = Column(DateTime(timezone=True), server_default=func.now())
    left_at = Column(DateTime(timezone=True), nullable=True)

    # Relationships
    room = relationship("ChatRoom", back_populates="participants")
    user = relationship("User")


class MessageReadReceipt(Base):
    """메시지 읽음 확인"""
    __tablename__ = "message_read_receipts"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    message_id = Column(UUID(as_uuid=True), ForeignKey("chat_messages.id"), nullable=False)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    read_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    message = relationship("ChatMessage", back_populates="read_receipts")
    user = relationship("User")
