from typing import Optional
from datetime import date
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.core.deps import get_current_admin_user, get_current_active_user
from app.models.user import User
from app.crud import crud_bank_transaction
from app.crud.crud_card_transaction import get_codef_accounts, upsert_codef_account
from app.schemas.bank_transaction import (
    BankTransaction as BankTransactionSchema,
    BankTransactionList,
    BankTransactionSyncRequest,
    BankTransactionSyncResponse,
    BANK_ORGANIZATION_MAP,
)
from app.services import codef_service

router = APIRouter()


# ============================================================================
# 은행 거래내역 조회
# ============================================================================

@router.get("/", response_model=BankTransactionList)
def get_bank_transactions(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=10000),
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    organization: Optional[str] = None,
    search: Optional[str] = None,
    owner_name: Optional[str] = None,
    account_no: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """은행 거래내역 목록 조회 (admin: 전체, 일반: 자기 것만)"""
    user_id = None if current_user.role == "admin" else current_user.id
    items, total = crud_bank_transaction.get_transactions(
        db,
        skip=skip,
        limit=limit,
        start_date=start_date,
        end_date=end_date,
        organization=organization,
        search=search,
        user_id=user_id,
        owner_name=owner_name,
        account_no=account_no,
    )
    return BankTransactionList(total=total, items=items)


@router.get("/stats")
def get_bank_transaction_stats(
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    organization: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """은행 거래내역 통계 (admin: 전체, 일반: 자기 것만)"""
    user_id = None if current_user.role == "admin" else current_user.id
    return crud_bank_transaction.get_transaction_stats(
        db, start_date=start_date, end_date=end_date, organization=organization,
        user_id=user_id,
    )


@router.get("/organizations")
def get_organizations(
    current_user: User = Depends(get_current_active_user),
):
    """지원 은행 목록"""
    return [
        {"code": code, "name": name}
        for code, name in BANK_ORGANIZATION_MAP.items()
    ]


@router.get("/{transaction_id}", response_model=BankTransactionSchema)
def get_bank_transaction(
    transaction_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """은행 거래내역 상세 조회"""
    tx = crud_bank_transaction.get_transaction(db, transaction_id)
    if not tx:
        raise HTTPException(status_code=404, detail="거래내역을 찾을 수 없습니다.")
    if current_user.role != "admin" and tx.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="접근 권한이 없습니다.")
    return tx


@router.delete("/{transaction_id}")
def delete_bank_transaction(
    transaction_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user),
):
    """은행 거래내역 삭제"""
    success = crud_bank_transaction.delete_transaction(db, transaction_id)
    if not success:
        raise HTTPException(status_code=404, detail="거래내역을 찾을 수 없습니다.")
    return {"message": "삭제되었습니다."}


@router.post("/delete-batch")
def delete_bank_transactions_batch(
    request: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user),
):
    """은행 거래내역 일괄 삭제"""
    ids = request.get("ids", [])
    if not ids:
        raise HTTPException(status_code=400, detail="삭제할 내역을 선택해주세요.")
    deleted = crud_bank_transaction.delete_transactions_batch(db, ids)
    return {"message": f"{deleted}건 삭제되었습니다.", "deleted_count": deleted}


# ============================================================================
# CODEF 동기화
# ============================================================================

@router.post("/sync", response_model=BankTransactionSyncResponse)
def sync_bank_transactions(
    request: BankTransactionSyncRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """CODEF API에서 은행 거래내역 동기화"""
    try:
        result = codef_service.sync_bank_transactions(
            db=db,
            organization=request.organization,
            account=request.account_no,
            start_date=request.start_date,
            end_date=request.end_date,
            user_id=current_user.id,
            owner_name=current_user.full_name,
            client_type=request.client_type,
        )
        return BankTransactionSyncResponse(**result)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=502, detail=str(e))


# ============================================================================
# 계정 정보 (codef_accounts 공유 - 은행 기관코드로 필터)
# ============================================================================

@router.get("/account/info")
def get_bank_account_info(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """은행별 계정 정보 조회 (은행 기관코드만 필터)"""
    saved_accounts = get_codef_accounts(db, user_id=current_user.id)

    result = []
    for acc in saved_accounts:
        # 은행 기관코드에 해당하는 것만 반환
        if acc.organization in BANK_ORGANIZATION_MAP:
            org_name = BANK_ORGANIZATION_MAP.get(acc.organization, acc.organization)
            result.append({
                "organization": acc.organization,
                "organization_name": org_name,
                "client_type": acc.client_type or "B",
                "login_id": acc.login_id,
                "account_no": acc.account_no,
                "connected_id": acc.connected_id,
                "owner_name": acc.owner_name,
                "is_connected": acc.is_connected or False,
                "connected_at": acc.connected_at,
            })

    return {"accounts": result}


@router.put("/account/info")
def save_bank_account_info(
    request: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """은행 계정 정보 저장 (계좌번호 등)"""
    upsert_codef_account(
        db,
        user_id=current_user.id,
        organization=request.get("organization", ""),
        client_type=request.get("client_type", "B"),
        account_no=request.get("account_no"),
        owner_name=current_user.full_name,
    )
    return {"message": "저장되었습니다."}
