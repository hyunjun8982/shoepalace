"""
사용자 요청사항 모델
"""
from sqlalchemy import Column, String, Text, Enum, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from .base import BaseModel
import enum


class RequestStatus(str, enum.Enum):
    """요청사항 상태"""
    PENDING = "pending"        # 대기
    IN_PROGRESS = "in_progress"  # 진행중
    COMPLETED = "completed"    # 완료
    REJECTED = "rejected"      # 반려


class FeatureRequest(BaseModel):
    """사용자 요청사항 모델"""
    __tablename__ = "feature_requests"

    # 요청 내용
    title = Column(String(200), nullable=False, comment="요청 제목")
    content = Column(Text, nullable=True, comment="요청 내용 (선택)")

    # 상태
    status = Column(Enum(RequestStatus), default=RequestStatus.PENDING, nullable=False, comment="상태")
    version = Column(String(20), nullable=True, comment="반영 버전")

    # 작성자 정보
    author_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True, comment="작성자 ID")
    author_name = Column(String(100), nullable=True, comment="작성자 이름")

    # 관리자 메모
    admin_note = Column(Text, nullable=True, comment="관리자 메모")
