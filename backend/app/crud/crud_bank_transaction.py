from typing import Optional
from datetime import date
from uuid import UUID

from sqlalchemy.orm import Session
from sqlalchemy import func, or_

from app.models.bank_transaction import BankTransaction


def get_transactions(
    db: Session,
    skip: int = 0,
    limit: int = 100,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    organization: Optional[str] = None,
    search: Optional[str] = None,
    owner_name: Optional[str] = None,
    user_id: Optional[UUID] = None,
    account_no: Optional[str] = None,
) -> tuple[list[BankTransaction], int]:
    """은행 거래내역 목록 조회"""
    query = db.query(BankTransaction)

    if user_id:
        query = query.filter(BankTransaction.user_id == user_id)
    if start_date:
        query = query.filter(BankTransaction.tr_date >= start_date)
    if end_date:
        query = query.filter(BankTransaction.tr_date <= end_date)
    if organization:
        query = query.filter(BankTransaction.organization == organization)
    if owner_name:
        query = query.filter(BankTransaction.owner_name == owner_name)
    if account_no:
        query = query.filter(BankTransaction.account_no == account_no)
    if search:
        query = query.filter(
            or_(
                BankTransaction.description1.ilike(f"%{search}%"),
                BankTransaction.description2.ilike(f"%{search}%"),
            )
        )

    total = query.count()
    items = query.order_by(
        BankTransaction.tr_date.desc(),
        BankTransaction.tr_time.desc()
    ).offset(skip).limit(limit).all()

    return items, total


def get_transaction(db: Session, transaction_id: str) -> Optional[BankTransaction]:
    return db.query(BankTransaction).filter(BankTransaction.id == transaction_id).first()


def delete_transaction(db: Session, transaction_id: str) -> bool:
    tx = db.query(BankTransaction).filter(BankTransaction.id == transaction_id).first()
    if tx:
        db.delete(tx)
        db.commit()
        return True
    return False


def delete_transactions_batch(db: Session, ids: list[str]) -> int:
    deleted = db.query(BankTransaction).filter(BankTransaction.id.in_(ids)).delete(synchronize_session=False)
    db.commit()
    return deleted


def get_transaction_stats(
    db: Session,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    organization: Optional[str] = None,
    user_id: Optional[UUID] = None,
) -> dict:
    """은행 거래내역 통계 (입금/출금 합계)"""
    query = db.query(BankTransaction)

    if user_id:
        query = query.filter(BankTransaction.user_id == user_id)
    if start_date:
        query = query.filter(BankTransaction.tr_date >= start_date)
    if end_date:
        query = query.filter(BankTransaction.tr_date <= end_date)
    if organization:
        query = query.filter(BankTransaction.organization == organization)

    total_count = query.count()
    total_in = query.with_entities(func.sum(BankTransaction.tr_amount_in)).scalar() or 0
    total_out = query.with_entities(func.sum(BankTransaction.tr_amount_out)).scalar() or 0

    return {
        "total_count": total_count,
        "total_in": float(total_in),
        "total_out": float(total_out),
    }
