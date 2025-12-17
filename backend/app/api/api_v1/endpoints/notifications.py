from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import desc
from typing import Optional
from datetime import datetime

from app.api.deps import get_db
from app.models.notification import Notification
from app.schemas.notification import (
    NotificationListResponse,
    NotificationInDB,
    NotificationUpdate
)

router = APIRouter()


@router.get("", response_model=NotificationListResponse)
def get_notifications(
    skip: int = 0,
    limit: int = 50,
    unread_only: bool = False,
    db: Session = Depends(get_db)
):
    """알림 목록 조회"""
    query = db.query(Notification)

    if unread_only:
        query = query.filter(Notification.is_read == False)

    # 최신순 정렬
    query = query.order_by(desc(Notification.created_at))

    total = query.count()
    unread_count = db.query(Notification).filter(Notification.is_read == False).count()

    notifications = query.offset(skip).limit(limit).all()

    return NotificationListResponse(
        items=[NotificationInDB.from_orm(n) for n in notifications],
        total=total,
        unread_count=unread_count
    )


@router.get("/unread-count")
def get_unread_count(db: Session = Depends(get_db)):
    """읽지 않은 알림 개수 조회"""
    count = db.query(Notification).filter(Notification.is_read == False).count()
    return {"count": count}


@router.patch("/{notification_id}", response_model=NotificationInDB)
def update_notification(
    notification_id: str,
    update_data: NotificationUpdate,
    db: Session = Depends(get_db)
):
    """알림 업데이트 (읽음 처리)"""
    notification = db.query(Notification).filter(Notification.id == notification_id).first()
    if not notification:
        raise HTTPException(status_code=404, detail="알림을 찾을 수 없습니다")

    if update_data.is_read is not None:
        notification.is_read = update_data.is_read
        if update_data.is_read:
            notification.read_at = datetime.now()

    db.commit()
    db.refresh(notification)

    return NotificationInDB.from_orm(notification)


@router.post("/mark-all-read")
def mark_all_as_read(db: Session = Depends(get_db)):
    """모든 알림 읽음 처리"""
    db.query(Notification).filter(Notification.is_read == False).update(
        {"is_read": True, "read_at": datetime.now()}
    )
    db.commit()
    return {"message": "모든 알림을 읽음 처리했습니다"}


@router.delete("/{notification_id}")
def delete_notification(
    notification_id: str,
    db: Session = Depends(get_db)
):
    """알림 삭제"""
    notification = db.query(Notification).filter(Notification.id == notification_id).first()
    if not notification:
        raise HTTPException(status_code=404, detail="알림을 찾을 수 없습니다")

    db.delete(notification)
    db.commit()

    return {"message": "알림이 삭제되었습니다"}
