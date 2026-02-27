from typing import Optional
from datetime import date, datetime
from uuid import UUID

from sqlalchemy.orm import Session
from sqlalchemy import func, or_

from app.models.card_transaction import CardTransaction
from app.models.codef_setting import CodefSetting
from app.models.codef_account import CodefAccount
from app.models.codef_api_log import CodefApiLog


# ============================================================================
# CardTransaction CRUD
# ============================================================================

def get_transactions(
    db: Session,
    skip: int = 0,
    limit: int = 100,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    organization: Optional[str] = None,
    search: Optional[str] = None,
    payment_type: Optional[str] = None,
    cancel_status: Optional[str] = None,
    user_id: Optional[UUID] = None,
    owner_name: Optional[str] = None,
    client_type: Optional[str] = None,
) -> tuple[list[CardTransaction], int]:
    """카드 내역 목록 조회 (필터링 + 페이지네이션)"""
    query = db.query(CardTransaction)

    if user_id:
        query = query.filter(CardTransaction.user_id == user_id)
    if start_date:
        query = query.filter(CardTransaction.used_date >= start_date)
    if end_date:
        query = query.filter(CardTransaction.used_date <= end_date)
    if organization:
        query = query.filter(CardTransaction.organization == organization)
    if payment_type:
        query = query.filter(CardTransaction.payment_type == payment_type)
    if cancel_status:
        query = query.filter(CardTransaction.cancel_status == cancel_status)
    if owner_name:
        query = query.filter(CardTransaction.owner_name == owner_name)
    if client_type:
        query = query.filter(CardTransaction.client_type == client_type)
    if search:
        query = query.filter(
            or_(
                CardTransaction.merchant_name.ilike(f"%{search}%"),
                CardTransaction.card_no.ilike(f"%{search}%"),
                CardTransaction.approval_no.ilike(f"%{search}%"),
            )
        )

    total = query.count()
    items = query.order_by(
        CardTransaction.used_date.desc(),
        CardTransaction.used_time.desc()
    ).offset(skip).limit(limit).all()

    return items, total


def get_transaction(db: Session, transaction_id: str) -> Optional[CardTransaction]:
    """카드 내역 단건 조회"""
    return db.query(CardTransaction).filter(CardTransaction.id == transaction_id).first()


def delete_transaction(db: Session, transaction_id: str) -> bool:
    """카드 내역 삭제"""
    tx = db.query(CardTransaction).filter(CardTransaction.id == transaction_id).first()
    if tx:
        db.delete(tx)
        db.commit()
        return True
    return False


def delete_transactions_batch(db: Session, ids: list[str]) -> int:
    """카드 내역 일괄 삭제"""
    deleted = db.query(CardTransaction).filter(CardTransaction.id.in_(ids)).delete(synchronize_session=False)
    db.commit()
    return deleted


def get_transaction_stats(
    db: Session,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    organization: Optional[str] = None,
    user_id: Optional[UUID] = None,
) -> dict:
    """카드 내역 통계"""
    query = db.query(CardTransaction)

    if user_id:
        query = query.filter(CardTransaction.user_id == user_id)
    if start_date:
        query = query.filter(CardTransaction.used_date >= start_date)
    if end_date:
        query = query.filter(CardTransaction.used_date <= end_date)
    if organization:
        query = query.filter(CardTransaction.organization == organization)

    # 정상 건
    normal_query = query.filter(CardTransaction.cancel_status == "normal")
    total_amount = normal_query.with_entities(func.sum(CardTransaction.used_amount)).scalar() or 0
    total_count = normal_query.count()

    # 취소 건
    cancel_query = query.filter(CardTransaction.cancel_status != "normal")
    cancel_count = cancel_query.count()
    cancel_amount = cancel_query.with_entities(func.sum(CardTransaction.used_amount)).scalar() or 0

    return {
        "total_amount": float(total_amount),
        "total_count": total_count,
        "cancel_count": cancel_count,
        "cancel_amount": float(cancel_amount),
    }


# ============================================================================
# CodefSetting CRUD
# ============================================================================

def get_codef_settings(db: Session) -> list[CodefSetting]:
    """모든 CODEF 설정 조회"""
    return db.query(CodefSetting).order_by(CodefSetting.setting_key).all()


def get_codef_setting(db: Session, key: str) -> Optional[CodefSetting]:
    """특정 CODEF 설정 조회"""
    return db.query(CodefSetting).filter(CodefSetting.setting_key == key).first()


def upsert_codef_setting(db: Session, key: str, value: str) -> CodefSetting:
    """CODEF 설정 upsert"""
    existing = db.query(CodefSetting).filter(CodefSetting.setting_key == key).first()
    if existing:
        existing.setting_value = value
        db.commit()
        db.refresh(existing)
        return existing
    else:
        new_setting = CodefSetting(setting_key=key, setting_value=value)
        db.add(new_setting)
        db.commit()
        db.refresh(new_setting)
        return new_setting


def bulk_update_codef_settings(db: Session, settings: dict[str, str]) -> list[CodefSetting]:
    """여러 CODEF 설정을 한번에 업데이트"""
    results = []
    for key, value in settings.items():
        result = upsert_codef_setting(db, key, value)
        results.append(result)
    return results


# ============================================================================
# CodefAccount CRUD
# ============================================================================

def get_codef_accounts(db: Session, user_id: Optional[UUID] = None) -> list[CodefAccount]:
    """저장된 카드사 계정 목록 조회"""
    query = db.query(CodefAccount)
    if user_id:
        query = query.filter(CodefAccount.user_id == user_id)
    return query.order_by(CodefAccount.organization).all()


def get_user_connected_id(db: Session, user_id: UUID, client_type: str = "P") -> Optional[str]:
    """사용자의 CODEF connected_id 조회 (같은 client_type 계정에서)"""
    acc = db.query(CodefAccount).filter(
        CodefAccount.user_id == user_id,
        CodefAccount.client_type == client_type,
        CodefAccount.connected_id.isnot(None),
        CodefAccount.connected_id != "",
    ).first()
    if acc:
        return acc.connected_id
    # fallback: client_type 무관하게 아무 connected_id
    acc = db.query(CodefAccount).filter(
        CodefAccount.user_id == user_id,
        CodefAccount.connected_id.isnot(None),
        CodefAccount.connected_id != "",
    ).first()
    return acc.connected_id if acc else None


def delete_codef_account(db: Session, user_id: UUID, organization: str, client_type: str = "P") -> bool:
    """카드사 계정 삭제"""
    acc = db.query(CodefAccount).filter(
        CodefAccount.user_id == user_id,
        CodefAccount.organization == organization,
        CodefAccount.client_type == client_type,
    ).first()
    if acc:
        db.delete(acc)
        db.commit()
        return True
    return False


def upsert_codef_account(
    db: Session,
    user_id: UUID,
    organization: str,
    client_type: str = "P",
    login_id: Optional[str] = None,
    card_no: Optional[str] = None,
    account_no: Optional[str] = None,
    connected_id: Optional[str] = None,
    owner_name: Optional[str] = None,
    is_connected: Optional[bool] = None,
) -> CodefAccount:
    """카드사/은행 계정 정보 upsert (사용자별, organization+client_type 기준)"""
    existing = db.query(CodefAccount).filter(
        CodefAccount.user_id == user_id,
        CodefAccount.organization == organization,
        CodefAccount.client_type == client_type,
    ).first()

    if existing:
        if login_id is not None:
            existing.login_id = login_id
        if card_no is not None:
            existing.card_no = card_no
        if account_no is not None:
            existing.account_no = account_no
        if connected_id is not None:
            existing.connected_id = connected_id
        if owner_name is not None:
            existing.owner_name = owner_name
        if is_connected is not None:
            existing.is_connected = is_connected
            if is_connected:
                existing.connected_at = datetime.utcnow()
        db.commit()
        db.refresh(existing)
        return existing
    else:
        new_account = CodefAccount(
            user_id=user_id,
            organization=organization,
            client_type=client_type,
            login_id=login_id,
            card_no=card_no,
            account_no=account_no,
            connected_id=connected_id,
            owner_name=owner_name,
            is_connected=is_connected or False,
            connected_at=datetime.utcnow() if is_connected else None,
        )
        db.add(new_account)
        db.commit()
        db.refresh(new_account)
        return new_account


# ============================================================================
# CodefApiLog CRUD
# ============================================================================

def get_daily_api_call_count(db: Session, target_date: Optional[date] = None) -> int:
    """오늘(또는 지정 날짜)의 CODEF API 호출 횟수"""
    if target_date is None:
        target_date = date.today()
    return db.query(CodefApiLog).filter(
        func.date(CodefApiLog.created_at) == target_date,
    ).count()


def record_api_call(
    db: Session,
    endpoint: str,
    user_id: Optional[UUID] = None,
    status_code: Optional[int] = None,
    res_code: Optional[str] = None,
    error_message: Optional[str] = None,
) -> CodefApiLog:
    """API 호출 로그 기록"""
    log = CodefApiLog(
        endpoint=endpoint,
        user_id=user_id,
        status_code=status_code,
        res_code=res_code,
        error_message=error_message,
    )
    db.add(log)
    db.commit()
    return log


def get_api_usage_stats(db: Session, target_date: Optional[date] = None) -> dict:
    """API 사용 현황 통계"""
    if target_date is None:
        target_date = date.today()

    daily_count = get_daily_api_call_count(db, target_date)

    # 최근 호출 시각
    last_call = db.query(CodefApiLog).filter(
        func.date(CodefApiLog.created_at) == target_date,
    ).order_by(CodefApiLog.created_at.desc()).first()

    return {
        "date": target_date.isoformat(),
        "daily_count": daily_count,
        "daily_limit": 100,
        "remaining": max(0, 100 - daily_count),
        "last_call_at": last_call.created_at.isoformat() if last_call else None,
    }
