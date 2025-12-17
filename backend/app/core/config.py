import os
from typing import Any, Dict, Optional, Union
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    # 기본 설정
    PROJECT_NAME: str = "슈팔라스 입출고 관리시스템"
    VERSION: str = "1.0.0"
    API_V1_STR: str = "/api/v1"

    # 환경 설정
    ENVIRONMENT: str = os.getenv("ENVIRONMENT", "development")
    DEBUG: bool = os.getenv("DEBUG", "true").lower() == "true"

    # 데이터베이스 설정
    DATABASE_URL: str = os.getenv(
        "DATABASE_URL",
        "postgresql://shoepalace_user:shoepalace_pass@localhost:5432/shoepalace"
    )

    # JWT 설정
    SECRET_KEY: str = os.getenv("SECRET_KEY", "your-super-secret-key-change-this-in-production")
    ALGORITHM: str = os.getenv("ALGORITHM", "HS256")
    ACCESS_TOKEN_EXPIRE_MINUTES: int = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "360"))

    # 파일 업로드 설정
    UPLOAD_DIR: str = os.getenv("UPLOAD_DIR", "./uploads")
    MAX_FILE_SIZE: int = int(os.getenv("MAX_FILE_SIZE", "10485760"))  # 10MB

    # 허용된 파일 확장자
    ALLOWED_EXTENSIONS: set = {".jpg", ".jpeg", ".png", ".gif", ".pdf"}

    # CORS 설정
    BACKEND_CORS_ORIGINS: list[str] = [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:8000",
        "http://127.0.0.1:8000",
    ]

    class Config:
        case_sensitive = True
        env_file = ".env"

settings = Settings()