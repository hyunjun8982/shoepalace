"""
아디다스 계정 모델
"""
import uuid
from datetime import datetime
from sqlalchemy import Column, String, DateTime, Boolean, Text, Integer
from sqlalchemy.dialects.postgresql import UUID

from app.db.database import Base


class AdidasAccount(Base):
    __tablename__ = "adidas_accounts"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email = Column(String, nullable=False, unique=True, index=True, comment="아디다스 계정 이메일")
    password = Column(String, nullable=False, comment="아디다스 계정 비밀번호")

    # 세션 쿠키 (수동 로그인 후 저장)
    session_cookies = Column(Text, nullable=True, comment="세션 쿠키 JSON (수동 로그인)")

    # 추가 정보 (마이페이지에서 가져온 정보)
    birthday = Column(String, nullable=True, comment="생일 (YYYY-MM-DD)")
    adikr_barcode = Column(String, nullable=True, comment="ADIKR 바코드 값")
    barcode_image_url = Column(String, nullable=True, comment="바코드 이미지 URL")
    name = Column(String, nullable=True, comment="계정 이름")
    phone = Column(String, nullable=True, comment="전화번호")
    current_points = Column(Integer, nullable=True, comment="현재 포인트")
    owned_vouchers = Column(Text, nullable=True, comment="보유 쿠폰 목록 (JSON)")

    # 상태
    is_active = Column(Boolean, default=True, comment="계정 사용 여부")
    last_login = Column(DateTime, nullable=True, comment="마지막 로그인 시각")
    last_coupon_check = Column(DateTime, nullable=True, comment="마지막 쿠폰 확인 시각")
    last_coupon_issued = Column(DateTime, nullable=True, comment="마지막 쿠폰 발급 시각")
    next_coupon_available_date = Column(String, nullable=True, comment="다음 쿠폰 발급 가능 날짜")

    # 조회 현황
    fetch_status = Column(String, nullable=True, comment="조회 현황 (레거시)")
    web_fetch_status = Column(String, nullable=True, comment="웹브라우저 조회 현황")
    mobile_fetch_status = Column(String, nullable=True, comment="모바일 조회 현황")
    web_issue_status = Column(String, nullable=True, comment="웹브라우저 쿠폰 발급 현황")
    mobile_issue_status = Column(String, nullable=True, comment="모바일 쿠폰 발급 현황")

    # 메모
    memo = Column(String, nullable=True, comment="메모")

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
