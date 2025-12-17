from typing import Generator, Optional
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import jwt, JWTError
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.database import get_db
from app.models.user import User
from app.crud.crud_user import user_crud

# JWT 토큰 스키마
security = HTTPBearer()

def get_current_user(
    db: Session = Depends(get_db),
    credentials: HTTPAuthorizationCredentials = Depends(security)
) -> User:
    """현재 인증된 사용자 반환"""
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )

    try:
        payload = jwt.decode(
            credentials.credentials,
            settings.SECRET_KEY,
            algorithms=[settings.ALGORITHM]
        )
        username: str = payload.get("sub")
        if username is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception

    user = user_crud.get_by_username(db, username=username)
    if user is None:
        raise credentials_exception
    return user

def get_current_active_user(
    current_user: User = Depends(get_current_user),
) -> User:
    """현재 활성화된 사용자 반환"""
    if not current_user.is_active:
        raise HTTPException(status_code=400, detail="Inactive user")
    return current_user

def get_current_admin_user(
    current_user: User = Depends(get_current_active_user),
) -> User:
    """현재 관리자 사용자 반환"""
    if current_user.role != "admin":
        raise HTTPException(
            status_code=403, detail="Not enough permissions"
        )
    return current_user

def get_current_buyer_user(
    current_user: User = Depends(get_current_active_user),
) -> User:
    """현재 구매자 사용자 반환"""
    if current_user.role not in ["admin", "buyer"]:
        raise HTTPException(
            status_code=403, detail="Not enough permissions"
        )
    return current_user

def get_current_seller_user(
    current_user: User = Depends(get_current_active_user),
) -> User:
    """현재 판매자 사용자 반환"""
    if current_user.role not in ["admin", "seller"]:
        raise HTTPException(
            status_code=403, detail="Not enough permissions"
        )
    return current_user