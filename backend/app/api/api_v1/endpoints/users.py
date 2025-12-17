from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from app.api.deps import get_db, get_current_user
from app.models.user import User, UserRole
from app.schemas.user import UserCreate, UserUpdate, User as UserSchema
from app.core.security import get_password_hash, verify_password
import uuid

router = APIRouter()

@router.get("/", response_model=List[UserSchema])
def get_users(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    search: Optional[str] = None,
    role: Optional[UserRole] = None,
    is_active: Optional[bool] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """사용자 목록 조회 (관리자만)"""
    if current_user.role != UserRole.admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="권한이 없습니다."
        )

    query = db.query(User)

    # 검색 필터
    if search:
        from sqlalchemy import or_
        search_filter = or_(
            User.username.ilike(f"%{search}%"),
            User.email.ilike(f"%{search}%"),
            User.full_name.ilike(f"%{search}%")
        )
        query = query.filter(search_filter)

    # 역할 필터
    if role:
        query = query.filter(User.role == role)

    # 활성화 상태 필터
    if is_active is not None:
        query = query.filter(User.is_active == is_active)

    users = query.offset(skip).limit(limit).all()
    return users

@router.post("/", response_model=UserSchema)
def create_user(
    user_create: UserCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """사용자 생성 (관리자만)"""
    if current_user.role != UserRole.admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="권한이 없습니다."
        )

    # 중복 체크
    existing_user = db.query(User).filter(
        (User.username == user_create.username) |
        (User.email == user_create.email)
    ).first()

    if existing_user:
        if existing_user.username == user_create.username:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="이미 사용중인 아이디입니다."
            )
        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="이미 사용중인 이메일입니다."
            )

    # 사용자 생성
    user = User(
        id=uuid.uuid4(),
        username=user_create.username,
        email=user_create.email,
        hashed_password=get_password_hash(user_create.password),
        full_name=user_create.full_name,
        role=user_create.role,
        is_active=user_create.is_active
    )

    db.add(user)
    db.commit()
    db.refresh(user)

    return user

@router.get("/{user_id}", response_model=UserSchema)
def get_user(
    user_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """사용자 상세 조회"""
    # 본인 또는 관리자만 조회 가능
    if str(current_user.id) != user_id and current_user.role != UserRole.admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="권한이 없습니다."
        )

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="사용자를 찾을 수 없습니다."
        )

    return user

@router.put("/{user_id}", response_model=UserSchema)
def update_user(
    user_id: str,
    user_update: UserUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """사용자 정보 수정"""
    # 본인 또는 관리자만 수정 가능
    if str(current_user.id) != user_id and current_user.role != UserRole.admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="권한이 없습니다."
        )

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="사용자를 찾을 수 없습니다."
        )

    # 중복 체크 (본인 제외)
    if user_update.username and user_update.username != user.username:
        existing_user = db.query(User).filter(
            User.username == user_update.username,
            User.id != user_id
        ).first()
        if existing_user:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="이미 사용중인 아이디입니다."
            )

    if user_update.email and user_update.email != user.email:
        existing_user = db.query(User).filter(
            User.email == user_update.email,
            User.id != user_id
        ).first()
        if existing_user:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="이미 사용중인 이메일입니다."
            )

    # 업데이트
    update_data = user_update.dict(exclude_unset=True)

    # 비밀번호 변경
    if "password" in update_data:
        update_data["hashed_password"] = get_password_hash(update_data.pop("password"))

    # 역할 변경은 관리자만 가능
    if "role" in update_data and current_user.role != UserRole.admin:
        update_data.pop("role")

    # is_active 변경은 관리자만 가능
    if "is_active" in update_data and current_user.role != UserRole.admin:
        update_data.pop("is_active")

    for field, value in update_data.items():
        setattr(user, field, value)

    db.commit()
    db.refresh(user)

    return user

@router.delete("/{user_id}")
def delete_user(
    user_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """사용자 삭제 (관리자만)"""
    if current_user.role != UserRole.admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="권한이 없습니다."
        )

    # 자기 자신은 삭제 불가
    if str(current_user.id) == user_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="자기 자신은 삭제할 수 없습니다."
        )

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="사용자를 찾을 수 없습니다."
        )

    db.delete(user)
    db.commit()

    return {"message": "사용자가 삭제되었습니다."}

@router.post("/{user_id}/change-password")
def change_password(
    user_id: str,
    current_password: str,
    new_password: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """비밀번호 변경"""
    # 본인만 변경 가능
    if str(current_user.id) != user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="권한이 없습니다."
        )

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="사용자를 찾을 수 없습니다."
        )

    # 현재 비밀번호 확인
    if not verify_password(current_password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="현재 비밀번호가 올바르지 않습니다."
        )

    # 새 비밀번호 설정
    user.hashed_password = get_password_hash(new_password)
    db.commit()

    return {"message": "비밀번호가 변경되었습니다."}

@router.post("/register", response_model=UserSchema)
def register(
    user_create: UserCreate,
    db: Session = Depends(get_db)
):
    """회원가입 (공개)"""
    # 중복 체크
    existing_user = db.query(User).filter(
        (User.username == user_create.username) |
        (User.email == user_create.email)
    ).first()

    if existing_user:
        if existing_user.username == user_create.username:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="이미 사용중인 아이디입니다."
            )
        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="이미 사용중인 이메일입니다."
            )

    # 사용자 생성 (기본 역할: buyer)
    user = User(
        id=uuid.uuid4(),
        username=user_create.username,
        email=user_create.email,
        hashed_password=get_password_hash(user_create.password),
        full_name=user_create.full_name,
        role=UserRole.buyer,  # 기본 역할
        is_active=True  # 기본 활성화
    )

    db.add(user)
    db.commit()
    db.refresh(user)

    return user