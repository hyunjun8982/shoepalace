from sqlalchemy import Column, String, Boolean, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.models.base import BaseModel


class CodefAccount(BaseModel):
    """카드사별 CODEF 계정 정보 (사용자별 관리)"""
    __tablename__ = "codef_accounts"
    __table_args__ = (
        UniqueConstraint('user_id', 'organization', 'client_type', name='uix_codef_account_user_org_type'),
    )

    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    organization = Column(String(10), nullable=False, index=True)
    client_type = Column(String(1), nullable=False, default="P")  # "P": 개인, "B": 법인
    login_id = Column(String(200), nullable=True)
    card_no = Column(String(200), nullable=True)
    account_no = Column(String(100), nullable=True)  # 은행 계좌번호
    connected_id = Column(String(200), nullable=True)
    owner_name = Column(String(100), nullable=True)
    is_connected = Column(Boolean, default=False)
    connected_at = Column(DateTime, nullable=True)

    user = relationship("User")
