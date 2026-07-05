from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from app.schemas.card import CardCreate, CardUpdate, CardResponse, CardListResponse
from app.models.card import Card
from app.db.database import get_db
from uuid import UUID

router = APIRouter()


@router.get("", response_model=CardListResponse)
def get_cards(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    is_active: bool = Query(None),
    db: Session = Depends(get_db)
):
    """카드 목록 조회"""
    query = db.query(Card)

    if is_active is not None:
        query = query.filter(Card.is_active == is_active)

    total = query.count()
    items = query.offset(skip).limit(limit).all()

    return CardListResponse(
        items=items,
        total=total,
        skip=skip,
        limit=limit
    )


@router.get("/{card_id}", response_model=CardResponse)
def get_card(card_id: UUID, db: Session = Depends(get_db)):
    """카드 상세 조회"""
    card = db.query(Card).filter(Card.id == card_id).first()
    if not card:
        raise HTTPException(status_code=404, detail="카드를 찾을 수 없습니다.")
    return card


@router.post("", response_model=CardResponse)
def create_card(card: CardCreate, db: Session = Depends(get_db)):
    """카드 생성"""
    # 중복 확인
    existing = db.query(Card).filter(
        Card.card_issuer == card.card_issuer,
        Card.card_number == card.card_number
    ).first()

    if existing:
        raise HTTPException(status_code=400, detail="이미 등록된 카드입니다.")

    new_card = Card(**card.dict())
    db.add(new_card)
    db.commit()
    db.refresh(new_card)
    return new_card


@router.put("/{card_id}", response_model=CardResponse)
def update_card(
    card_id: UUID,
    card_data: CardUpdate,
    db: Session = Depends(get_db)
):
    """카드 수정"""
    card = db.query(Card).filter(Card.id == card_id).first()
    if not card:
        raise HTTPException(status_code=404, detail="카드를 찾을 수 없습니다.")

    update_data = card_data.dict(exclude_unset=True)
    for field, value in update_data.items():
        setattr(card, field, value)

    db.commit()
    db.refresh(card)
    return card


@router.delete("/{card_id}")
def delete_card(card_id: UUID, db: Session = Depends(get_db)):
    """카드 삭제"""
    card = db.query(Card).filter(Card.id == card_id).first()
    if not card:
        raise HTTPException(status_code=404, detail="카드를 찾을 수 없습니다.")

    # 외래키 확인
    purchase_count = db.query(Card).filter(Card.id == card_id).first().purchases.__len__() if card.purchases else 0
    sale_count = db.query(Card).filter(Card.id == card_id).first().sales.__len__() if card.sales else 0

    if purchase_count > 0 or sale_count > 0:
        raise HTTPException(
            status_code=400,
            detail=f"이 카드는 {purchase_count}건의 구매와 {sale_count}건의 판매에서 사용 중입니다. 먼저 해당 기록을 수정해주세요."
        )

    db.delete(card)
    db.commit()
    return {"message": "카드가 삭제되었습니다."}
