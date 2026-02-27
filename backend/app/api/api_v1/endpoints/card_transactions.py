from typing import Optional
from datetime import date
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.core.deps import get_current_admin_user, get_current_active_user
from app.models.user import User
from app.crud import crud_card_transaction
from app.crud.crud_card_transaction import get_api_usage_stats
from app.schemas.card_transaction import (
    CardTransaction as CardTransactionSchema,
    CardTransactionList,
    CardTransactionSyncRequest,
    CardTransactionSyncResponse,
    CardListResponse,
    AccountRegisterRequest,
    AccountRegisterResponse,
    ConnectedAccountListResponse,
    CodefAccountInfo,
    CodefAccountListResponse,
    CodefAccountSaveRequest,
    ORGANIZATION_MAP,
)
from app.schemas.codef_setting import (
    CodefSetting as CodefSettingSchema,
    CodefSettingList,
    CodefSettingsBulkUpdate,
)
from app.services import codef_service

router = APIRouter()


# ============================================================================
# 카드 내역 조회
# ============================================================================

@router.get("/", response_model=CardTransactionList)
def get_card_transactions(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=10000),
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    organization: Optional[str] = None,
    search: Optional[str] = None,
    payment_type: Optional[str] = None,
    cancel_status: Optional[str] = None,
    owner_name: Optional[str] = None,
    client_type: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """카드 이용 내역 목록 조회 (admin: 전체, 일반: 자기 것만)"""
    user_id = None if current_user.role == "admin" else current_user.id
    items, total = crud_card_transaction.get_transactions(
        db,
        skip=skip,
        limit=limit,
        start_date=start_date,
        end_date=end_date,
        organization=organization,
        search=search,
        payment_type=payment_type,
        cancel_status=cancel_status,
        user_id=user_id,
        owner_name=owner_name,
        client_type=client_type,
    )
    return CardTransactionList(total=total, items=items)


@router.get("/stats")
def get_card_transaction_stats(
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    organization: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """카드 내역 통계 (admin: 전체, 일반: 자기 것만)"""
    user_id = None if current_user.role == "admin" else current_user.id
    return crud_card_transaction.get_transaction_stats(
        db, start_date=start_date, end_date=end_date, organization=organization,
        user_id=user_id,
    )


@router.get("/organizations")
def get_organizations(
    current_user: User = Depends(get_current_active_user),
):
    """지원 카드사 목록"""
    return [
        {"code": code, "name": name}
        for code, name in ORGANIZATION_MAP.items()
    ]


@router.get("/api-usage")
def get_api_usage(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """CODEF API 일일 호출 현황 조회"""
    return get_api_usage_stats(db)


@router.get("/{transaction_id}", response_model=CardTransactionSchema)
def get_card_transaction(
    transaction_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """카드 이용 내역 상세 조회"""
    tx = crud_card_transaction.get_transaction(db, transaction_id)
    if not tx:
        raise HTTPException(status_code=404, detail="카드 내역을 찾을 수 없습니다.")
    # 일반 사용자는 자기 내역만 조회 가능
    if current_user.role != "admin" and tx.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="접근 권한이 없습니다.")
    return tx


@router.delete("/{transaction_id}")
def delete_card_transaction(
    transaction_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user),
):
    """카드 이용 내역 삭제"""
    success = crud_card_transaction.delete_transaction(db, transaction_id)
    if not success:
        raise HTTPException(status_code=404, detail="카드 내역을 찾을 수 없습니다.")
    return {"message": "삭제되었습니다."}


@router.post("/delete-batch")
def delete_card_transactions_batch(
    request: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user),
):
    """카드 이용 내역 일괄 삭제"""
    ids = request.get("ids", [])
    if not ids:
        raise HTTPException(status_code=400, detail="삭제할 내역을 선택해주세요.")
    deleted = crud_card_transaction.delete_transactions_batch(db, ids)
    return {"message": f"{deleted}건 삭제되었습니다.", "deleted_count": deleted}


# ============================================================================
# CODEF 동기화
# ============================================================================

@router.post("/sync", response_model=CardTransactionSyncResponse)
def sync_card_transactions(
    request: CardTransactionSyncRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """CODEF API에서 카드 승인내역 동기화 (자기 계정으로 동기화)"""
    try:
        result = codef_service.sync_approval_list(
            db=db,
            organization=request.organization,
            start_date=request.start_date,
            end_date=request.end_date,
            inquiry_type=request.inquiry_type,
            card_no=request.card_no,
            member_store_info_type=request.member_store_info_type,
            user_id=current_user.id,
            owner_name=current_user.full_name,
            client_type=request.client_type,
        )
        return CardTransactionSyncResponse(**result)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.get("/cards/{organization}", response_model=CardListResponse)
def get_card_list(
    organization: str,
    client_type: str = Query("P", description="P: 개인, B: 법인"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """보유카드 목록 조회 (CODEF API)"""
    try:
        cards = codef_service.get_card_list(db, organization, user_id=current_user.id, client_type=client_type)
        return CardListResponse(cards=cards, organization=organization)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=502, detail=str(e))


# ============================================================================
# CODEF 계정 연동
# ============================================================================

@router.post("/account/register", response_model=AccountRegisterResponse)
def register_account(
    request: AccountRegisterRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """카드사 계정 연동 (CODEF 계정 등록/추가, 사용자별)"""
    try:
        result = codef_service.register_account(
            db=db,
            organization=request.organization,
            login_id=request.login_id,
            password=request.password,
            card_no=request.card_no,
            card_password=request.card_password,
            client_type=request.client_type,
            business_type=request.business_type,
            user_id=current_user.id,
            owner_name=current_user.full_name,
        )
        return AccountRegisterResponse(**result)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.get("/account/list", response_model=ConnectedAccountListResponse)
def get_connected_accounts(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """연결된 카드사 계정 목록 조회"""
    accounts = codef_service.get_connected_accounts(db, user_id=current_user.id)
    return ConnectedAccountListResponse(accounts=accounts)


@router.get("/account/info", response_model=CodefAccountListResponse)
def get_account_info(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """카드사별 계정 정보 조회 (사용자별, 등록된 것만 반환)"""
    saved_accounts = crud_card_transaction.get_codef_accounts(db, user_id=current_user.id)

    result = []
    for acc in saved_accounts:
        # 카드 기관코드만 필터링 (은행 기관코드 제외)
        if acc.organization not in ORGANIZATION_MAP:
            continue
        org_name = ORGANIZATION_MAP.get(acc.organization, acc.organization)
        result.append(CodefAccountInfo(
            organization=acc.organization,
            organization_name=org_name,
            client_type=acc.client_type or "P",
            login_id=acc.login_id,
            card_no=acc.card_no,
            connected_id=acc.connected_id,
            owner_name=acc.owner_name,
            is_connected=acc.is_connected or False,
            connected_at=acc.connected_at,
        ))

    return CodefAccountListResponse(accounts=result)


@router.put("/account/info")
def save_account_info(
    request: CodefAccountSaveRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """카드사 계정 정보 저장 (사용자별, 연동 없이 로그인 ID/카드번호만 저장)"""
    crud_card_transaction.upsert_codef_account(
        db,
        user_id=current_user.id,
        organization=request.organization,
        client_type=request.client_type,
        login_id=request.login_id,
        card_no=request.card_no,
        owner_name=current_user.full_name,
    )
    return {"message": "저장되었습니다."}


@router.delete("/account/{organization}")
def delete_account(
    organization: str,
    client_type: str = Query("P", description="P: 개인, B: 법인"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """카드사 계정 연동 해제 (DB에서 삭제)"""
    success = crud_card_transaction.delete_codef_account(db, current_user.id, organization, client_type)
    if not success:
        raise HTTPException(status_code=404, detail="해당 카드사 계정을 찾을 수 없습니다.")
    org_name = ORGANIZATION_MAP.get(organization, organization)
    return {"message": f"{org_name} 계정이 해제되었습니다."}


# ============================================================================
# CODEF 설정 관리
# ============================================================================

@router.get("/settings/codef", response_model=CodefSettingList)
def get_codef_settings(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user),
):
    """CODEF API 설정 조회"""
    settings = crud_card_transaction.get_codef_settings(db)
    # 암호화된 값은 마스킹
    for setting in settings:
        if setting.is_encrypted and setting.setting_value:
            setting.setting_value = "●" * 8
    return CodefSettingList(items=settings)


@router.put("/settings/codef", response_model=CodefSettingList)
def update_codef_settings(
    request: CodefSettingsBulkUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user),
):
    """CODEF API 설정 일괄 업데이트"""
    # 마스킹된 값(●●●●●●●●)은 업데이트 건너뛰기
    filtered = {k: v for k, v in request.settings.items() if "●" not in v}
    crud_card_transaction.bulk_update_codef_settings(db, filtered)

    # 업데이트 후 전체 설정 반환 (암호화 값 마스킹)
    settings = crud_card_transaction.get_codef_settings(db)
    for setting in settings:
        if setting.is_encrypted and setting.setting_value:
            setting.setting_value = "●" * 8
    return CodefSettingList(items=settings)
