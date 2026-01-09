from pydantic import BaseModel, Field, field_serializer
from typing import Optional
from datetime import datetime
from uuid import UUID
from app.models.feature_request import RequestStatus


class FeatureRequestBase(BaseModel):
    """요청사항 기본 스키마"""
    title: str = Field(..., min_length=1, max_length=200, description="요청 제목")


class FeatureRequestCreate(FeatureRequestBase):
    """요청사항 생성 스키마"""
    content: Optional[str] = Field(None, description="요청 내용 (선택)")
    author_name: Optional[str] = Field(None, max_length=100, description="작성자 이름")


class FeatureRequestUpdate(BaseModel):
    """요청사항 업데이트 스키마"""
    title: Optional[str] = Field(None, max_length=200)
    content: Optional[str] = None
    status: Optional[RequestStatus] = None
    version: Optional[str] = Field(None, max_length=20)
    admin_note: Optional[str] = None


class FeatureRequestInDB(FeatureRequestBase):
    """DB 저장용 요청사항 스키마"""
    id: UUID
    content: Optional[str] = None
    status: RequestStatus
    version: Optional[str] = None
    author_id: Optional[UUID] = None
    author_name: Optional[str] = None
    admin_note: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    @field_serializer('id', 'author_id')
    def serialize_uuid(self, value: Optional[UUID]) -> Optional[str]:
        """UUID를 문자열로 변환"""
        return str(value) if value else None

    class Config:
        from_attributes = True


class FeatureRequestListResponse(BaseModel):
    """요청사항 목록 응답 스키마"""
    items: list[FeatureRequestInDB]
    total: int
