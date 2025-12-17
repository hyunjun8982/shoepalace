from pydantic import BaseModel, Field, field_serializer
from typing import Optional
from datetime import datetime
from uuid import UUID
from app.models.notification import NotificationType


class NotificationBase(BaseModel):
    """알림 기본 스키마"""
    type: NotificationType
    title: str
    message: str
    product_id: Optional[str] = None
    product_name: Optional[str] = None
    product_code: Optional[str] = None
    product_image_url: Optional[str] = None
    size: Optional[str] = None
    previous_quantity: Optional[str] = None
    current_quantity: Optional[str] = None


class NotificationCreate(NotificationBase):
    """알림 생성 스키마"""
    pass


class NotificationUpdate(BaseModel):
    """알림 업데이트 스키마"""
    is_read: Optional[bool] = None


class NotificationInDB(NotificationBase):
    """DB 저장용 알림 스키마"""
    id: UUID
    is_read: bool
    created_at: datetime
    read_at: Optional[datetime] = None

    @field_serializer('id')
    def serialize_id(self, value: UUID) -> str:
        """UUID를 문자열로 변환"""
        return str(value)

    class Config:
        from_attributes = True


class NotificationListResponse(BaseModel):
    """알림 목록 응답 스키마"""
    items: list[NotificationInDB]
    total: int
    unread_count: int
