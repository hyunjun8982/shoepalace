from typing import Optional
from uuid import UUID
from pydantic import BaseModel, EmailStr, field_validator
from app.models.user import UserRole

# 기본 사용자 스키마
class UserBase(BaseModel):
    username: Optional[str] = None
    email: Optional[EmailStr] = None
    full_name: Optional[str] = None
    role: Optional[UserRole] = None
    is_active: Optional[bool] = True

# 사용자 생성 스키마
class UserCreate(UserBase):
    username: str
    email: EmailStr
    password: str
    full_name: str
    role: UserRole

# 사용자 업데이트 스키마
class UserUpdate(UserBase):
    password: Optional[str] = None

# 데이터베이스에서 읽어올 때 사용하는 스키마
class UserInDBBase(UserBase):
    id: str

    @field_validator('id', mode='before')
    @classmethod
    def convert_uuid_to_str(cls, v):
        if isinstance(v, UUID):
            return str(v)
        return v

    class Config:
        from_attributes = True

# API 응답에서 사용하는 스키마
class User(UserInDBBase):
    pass

# 데이터베이스 내부에서 사용하는 스키마
class UserInDB(UserInDBBase):
    hashed_password: str

# 로그인 스키마
class UserLogin(BaseModel):
    username: str
    password: str

# 토큰 스키마
class Token(BaseModel):
    access_token: str
    token_type: str

class TokenData(BaseModel):
    username: Optional[str] = None