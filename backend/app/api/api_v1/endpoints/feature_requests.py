from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import desc
from typing import Optional

from app.api.deps import get_db
from app.models.feature_request import FeatureRequest, RequestStatus
from app.schemas.feature_request import (
    FeatureRequestCreate,
    FeatureRequestUpdate,
    FeatureRequestInDB,
    FeatureRequestListResponse
)

router = APIRouter()


@router.get("", response_model=FeatureRequestListResponse)
def get_feature_requests(
    skip: int = 0,
    limit: int = 100,
    status: Optional[RequestStatus] = None,
    db: Session = Depends(get_db)
):
    """요청사항 목록 조회"""
    query = db.query(FeatureRequest)

    if status:
        query = query.filter(FeatureRequest.status == status)

    # 최신순 정렬
    query = query.order_by(desc(FeatureRequest.created_at))

    total = query.count()
    items = query.offset(skip).limit(limit).all()

    return FeatureRequestListResponse(
        items=[FeatureRequestInDB.model_validate(item) for item in items],
        total=total
    )


@router.get("/{request_id}", response_model=FeatureRequestInDB)
def get_feature_request(
    request_id: str,
    db: Session = Depends(get_db)
):
    """요청사항 상세 조회"""
    item = db.query(FeatureRequest).filter(FeatureRequest.id == request_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="요청사항을 찾을 수 없습니다")
    return FeatureRequestInDB.model_validate(item)


@router.post("", response_model=FeatureRequestInDB)
def create_feature_request(
    data: FeatureRequestCreate,
    db: Session = Depends(get_db)
):
    """요청사항 등록"""
    item = FeatureRequest(
        title=data.title,
        content=data.content,
        author_name=data.author_name,
        status=RequestStatus.PENDING
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return FeatureRequestInDB.model_validate(item)


@router.patch("/{request_id}", response_model=FeatureRequestInDB)
def update_feature_request(
    request_id: str,
    data: FeatureRequestUpdate,
    db: Session = Depends(get_db)
):
    """요청사항 수정"""
    item = db.query(FeatureRequest).filter(FeatureRequest.id == request_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="요청사항을 찾을 수 없습니다")

    update_data = data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(item, field, value)

    db.commit()
    db.refresh(item)
    return FeatureRequestInDB.model_validate(item)


@router.delete("/{request_id}")
def delete_feature_request(
    request_id: str,
    db: Session = Depends(get_db)
):
    """요청사항 삭제"""
    item = db.query(FeatureRequest).filter(FeatureRequest.id == request_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="요청사항을 찾을 수 없습니다")

    db.delete(item)
    db.commit()
    return {"message": "요청사항이 삭제되었습니다"}
