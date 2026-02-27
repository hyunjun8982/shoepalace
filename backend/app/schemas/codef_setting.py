from typing import Optional
from datetime import datetime
from uuid import UUID
from pydantic import BaseModel, field_validator


class CodefSettingBase(BaseModel):
    setting_key: str
    setting_value: Optional[str] = ""
    description: Optional[str] = None
    is_encrypted: bool = False


class CodefSettingCreate(CodefSettingBase):
    pass


class CodefSettingUpdate(BaseModel):
    setting_value: Optional[str] = None


class CodefSetting(CodefSettingBase):
    id: str
    created_at: datetime
    updated_at: datetime

    @field_validator('id', mode='before')
    @classmethod
    def convert_uuid_to_str(cls, v):
        if isinstance(v, UUID):
            return str(v)
        return v

    class Config:
        from_attributes = True


class CodefSettingList(BaseModel):
    items: list[CodefSetting]


class CodefSettingsBulkUpdate(BaseModel):
    """여러 설정을 한번에 업데이트"""
    settings: dict[str, str]  # {setting_key: setting_value}
