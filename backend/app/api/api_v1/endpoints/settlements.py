from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import and_, or_, func
from datetime import datetime, timedelta
import uuid

from app.db.database import get_db
from app.schemas.settlement import (
    Settlement,
    SettlementCreate,
    SettlementUpdate,
    SettlementList,
    SettlementSummary,
    SettlementStatus,
    SettlementType
)
from app.models.settlement import Settlement as SettlementModel
from app.models.purchase import Purchase
from app.models.sale import Sale
from app.models.user import User
from app.api.deps import get_current_user
from app.schemas.user import User as UserSchema

router = APIRouter()


@router.get("/", response_model=SettlementList)
async def get_settlements(
    skip: int = Query(0, ge=0),
    limit: int = Query(10, ge=1, le=100),
    settlement_type: Optional[SettlementType] = None,
    status: Optional[SettlementStatus] = None,
    target_user_id: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: UserSchema = Depends(get_current_user)
):
    """정산 목록 조회"""
    query = db.query(SettlementModel)

    # 필터링
    if settlement_type:
        query = query.filter(SettlementModel.settlement_type == settlement_type)
    if status:
        query = query.filter(SettlementModel.status == status)
    if target_user_id:
        query = query.filter(SettlementModel.target_user_id == target_user_id)
    if start_date:
        query = query.filter(SettlementModel.settlement_date >= datetime.fromisoformat(start_date))
    if end_date:
        query = query.filter(SettlementModel.settlement_date <= datetime.fromisoformat(end_date))

    # 권한에 따른 필터링
    if current_user.role == "seller":
        query = query.filter(SettlementModel.target_user_id == current_user.id)
    elif current_user.role == "buyer":
        query = query.filter(SettlementModel.target_user_id == current_user.id)

    total = query.count()
    settlements = query.order_by(SettlementModel.created_at.desc()).offset(skip).limit(limit).all()

    return SettlementList(
        items=settlements,
        total=total,
        skip=skip,
        limit=limit
    )


@router.get("/summary", response_model=SettlementSummary)
async def get_settlement_summary(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: UserSchema = Depends(get_current_user)
):
    """정산 요약 정보 조회"""
    query = db.query(SettlementModel)

    # 권한에 따른 필터링
    if current_user.role != "admin":
        query = query.filter(SettlementModel.target_user_id == current_user.id)

    if start_date:
        query = query.filter(SettlementModel.settlement_date >= datetime.fromisoformat(start_date))
    if end_date:
        query = query.filter(SettlementModel.settlement_date <= datetime.fromisoformat(end_date))

    settlements = query.all()

    total_settlements = len(settlements)
    pending_count = sum(1 for s in settlements if s.status == SettlementStatus.PENDING)
    completed_count = sum(1 for s in settlements if s.status == SettlementStatus.COMPLETED)
    total_amount = sum(s.total_amount for s in settlements)
    total_settlement_amount = sum(s.settlement_amount for s in settlements)
    total_fee_amount = sum(s.fee_amount for s in settlements)
    total_final_amount = sum(s.final_amount for s in settlements)

    return SettlementSummary(
        total_settlements=total_settlements,
        pending_count=pending_count,
        completed_count=completed_count,
        total_amount=total_amount,
        total_settlement_amount=total_settlement_amount,
        total_fee_amount=total_fee_amount,
        total_final_amount=total_final_amount
    )


@router.get("/{settlement_id}", response_model=Settlement)
async def get_settlement(
    settlement_id: str,
    db: Session = Depends(get_db),
    current_user: UserSchema = Depends(get_current_user)
):
    """정산 상세 조회"""
    settlement = db.query(SettlementModel).filter(SettlementModel.id == settlement_id).first()
    if not settlement:
        raise HTTPException(status_code=404, detail="정산을 찾을 수 없습니다.")

    # 권한 확인
    if current_user.role != "admin" and settlement.target_user_id != current_user.id:
        raise HTTPException(status_code=403, detail="권한이 없습니다.")

    return settlement


@router.post("/", response_model=Settlement)
async def create_settlement(
    settlement_data: SettlementCreate,
    db: Session = Depends(get_db),
    current_user: UserSchema = Depends(get_current_user)
):
    """정산 생성"""
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="관리자만 정산을 생성할 수 있습니다.")

    settlement = SettlementModel(
        **settlement_data.dict()
    )

    db.add(settlement)
    db.commit()
    db.refresh(settlement)

    return settlement


@router.post("/calculate", response_model=Settlement)
async def calculate_settlement(
    settlement_type: SettlementType,
    start_date: str,
    end_date: str,
    target_user_id: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: UserSchema = Depends(get_current_user)
):
    """정산 자동 계산"""
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="관리자만 정산을 계산할 수 있습니다.")

    start = datetime.fromisoformat(start_date)
    end = datetime.fromisoformat(end_date)

    # 사용자 정보 조회
    target_user = None
    target_user_name = None
    if target_user_id:
        user = db.query(User).filter(User.id == target_user_id).first()
        if user:
            target_user_name = user.username

    total_amount = 0
    settlement_amount = 0
    fee_amount = 0
    transaction_count = 0

    if settlement_type == SettlementType.PURCHASE:
        # 구매 정산 계산
        query = db.query(Purchase).filter(
            and_(
                Purchase.purchase_date >= start,
                Purchase.purchase_date <= end
            )
        )
        if target_user_id:
            query = query.filter(Purchase.buyer_id == target_user_id)

        purchases = query.all()
        transaction_count = len(purchases)
        total_amount = sum(p.total_amount for p in purchases)
        # 구매자 수수료 계산 (예: 3%)
        fee_amount = total_amount * 0.03
        settlement_amount = total_amount - fee_amount

    elif settlement_type == SettlementType.SALE:
        # 판매 정산 계산
        query = db.query(Sale).filter(
            and_(
                Sale.sale_date >= start,
                Sale.sale_date <= end
            )
        )
        if target_user_id:
            query = query.filter(Sale.seller_id == target_user_id)

        sales = query.all()
        transaction_count = len(sales)
        total_amount = sum(s.total_amount for s in sales)
        # 판매자 마진 합계
        settlement_amount = sum(s.seller_margin for s in sales if s.seller_margin)
        # 수수료 계산 (예: 5%)
        fee_amount = settlement_amount * 0.05

    elif settlement_type == SettlementType.MONTHLY:
        # 월간 정산 (구매 + 판매)
        purchases = db.query(Purchase).filter(
            and_(
                Purchase.purchase_date >= start,
                Purchase.purchase_date <= end
            )
        ).all()

        sales = db.query(Sale).filter(
            and_(
                Sale.sale_date >= start,
                Sale.sale_date <= end
            )
        ).all()

        purchase_amount = sum(p.total_amount for p in purchases)
        sale_amount = sum(s.total_amount for s in sales)
        total_amount = purchase_amount + sale_amount
        transaction_count = len(purchases) + len(sales)

        # 회사 마진 계산
        company_margin = sum(s.company_margin for s in sales if s.company_margin)
        settlement_amount = company_margin
        fee_amount = 0

    # 세금 계산 (예: 10%)
    tax_amount = settlement_amount * 0.1
    final_amount = settlement_amount - fee_amount - tax_amount

    # 정산 생성
    settlement = SettlementModel(
        settlement_type=settlement_type,
        settlement_date=datetime.utcnow(),
        start_date=start,
        end_date=end,
        target_user_id=target_user_id,
        target_user_name=target_user_name,
        total_amount=total_amount,
        settlement_amount=settlement_amount,
        fee_amount=fee_amount,
        tax_amount=tax_amount,
        final_amount=final_amount,
        transaction_count=transaction_count,
        status=SettlementStatus.PENDING
    )

    db.add(settlement)
    db.commit()
    db.refresh(settlement)

    return settlement


@router.put("/{settlement_id}", response_model=Settlement)
async def update_settlement(
    settlement_id: str,
    settlement_update: SettlementUpdate,
    db: Session = Depends(get_db),
    current_user: UserSchema = Depends(get_current_user)
):
    """정산 수정"""
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="관리자만 정산을 수정할 수 있습니다.")

    settlement = db.query(SettlementModel).filter(SettlementModel.id == settlement_id).first()
    if not settlement:
        raise HTTPException(status_code=404, detail="정산을 찾을 수 없습니다.")

    update_data = settlement_update.dict(exclude_unset=True)
    for field, value in update_data.items():
        setattr(settlement, field, value)

    # 상태가 완료로 변경되면 처리 정보 업데이트
    if settlement_update.status == SettlementStatus.COMPLETED:
        settlement.processed_by = current_user.id
        settlement.processed_at = datetime.utcnow()

    db.commit()
    db.refresh(settlement)

    return settlement


@router.delete("/{settlement_id}")
async def delete_settlement(
    settlement_id: str,
    db: Session = Depends(get_db),
    current_user: UserSchema = Depends(get_current_user)
):
    """정산 삭제"""
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="관리자만 정산을 삭제할 수 있습니다.")

    settlement = db.query(SettlementModel).filter(SettlementModel.id == settlement_id).first()
    if not settlement:
        raise HTTPException(status_code=404, detail="정산을 찾을 수 없습니다.")

    db.delete(settlement)
    db.commit()

    return {"message": "정산이 삭제되었습니다."}