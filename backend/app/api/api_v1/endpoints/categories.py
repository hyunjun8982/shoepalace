from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.api.deps import get_db, get_current_user
from app.models.user import User
from app.models.category import Category
from app.schemas.category import (
    Category as CategorySchema,
    CategoryList,
    CategoryCreate,
    CategoryUpdate
)

router = APIRouter()

@router.get("/", response_model=CategoryList)
def get_categories(
    skip: int = 0,
    limit: int = 100,
    is_active: Optional[bool] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """카테고리 목록 조회"""
    query = db.query(Category)

    if is_active is not None:
        query = query.filter(Category.is_active == is_active)

    # display_order로 정렬
    query = query.order_by(Category.display_order)

    total = query.count()
    categories = query.offset(skip).limit(limit).all()

    return CategoryList(total=total, items=categories)

@router.get("/{category_id}", response_model=CategorySchema)
def get_category(
    category_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """카테고리 상세 조회"""
    category = db.query(Category).filter(Category.id == category_id).first()
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")

    return category

@router.post("/", response_model=CategorySchema)
def create_category(
    category_data: CategoryCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """카테고리 등록"""
    # admin만 카테고리 등록 가능
    if current_user.role.value != "admin":
        raise HTTPException(status_code=403, detail="Not authorized")

    # 중복 카테고리명 체크
    existing = db.query(Category).filter(
        Category.name == category_data.name
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="Category name already exists")

    category = Category(**category_data.dict())

    db.add(category)
    db.commit()
    db.refresh(category)

    return category

@router.put("/{category_id}", response_model=CategorySchema)
def update_category(
    category_id: str,
    category_update: CategoryUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """카테고리 정보 수정"""
    # admin만 카테고리 수정 가능
    if current_user.role.value != "admin":
        raise HTTPException(status_code=403, detail="Not authorized")

    category = db.query(Category).filter(Category.id == category_id).first()
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")

    # 업데이트
    update_data = category_update.dict(exclude_unset=True)
    for field, value in update_data.items():
        setattr(category, field, value)

    db.commit()
    db.refresh(category)

    return category

@router.delete("/{category_id}")
def delete_category(
    category_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """카테고리 삭제"""
    # admin만 삭제 가능
    if current_user.role.value != "admin":
        raise HTTPException(status_code=403, detail="Not authorized")

    category = db.query(Category).filter(Category.id == category_id).first()
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")

    db.delete(category)
    db.commit()

    return {"message": "Category deleted successfully"}
