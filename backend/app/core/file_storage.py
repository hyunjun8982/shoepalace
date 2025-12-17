"""
통합 파일 저장 시스템
날짜 기반 디렉토리 구조로 파일 관리
"""
import os
import shutil
from pathlib import Path
from datetime import datetime
import uuid
from typing import Optional, BinaryIO
from fastapi import UploadFile, HTTPException

class FileStorage:
    """파일 저장소 클래스"""

    # 파일 타입별 설정
    FILE_CONFIGS = {
        'product_image': {
            'base_path': 'products/images',
            'allowed_extensions': ['.jpg', '.jpeg', '.png', '.webp'],
            'max_size': 5 * 1024 * 1024  # 5MB
        },
        'purchase_receipt': {
            'base_path': 'purchases/receipts',
            'allowed_extensions': ['.jpg', '.jpeg', '.png', '.pdf'],
            'max_size': 10 * 1024 * 1024  # 10MB
        },
        'sale_transaction_statement': {
            'base_path': 'sales/transaction_statements',
            'allowed_extensions': ['.xlsx', '.xls', '.csv'],
            'max_size': 10 * 1024 * 1024  # 10MB
        },
        'sale_tax_invoice': {
            'base_path': 'sales/tax_invoices',
            'allowed_extensions': ['.jpg', '.jpeg', '.png', '.pdf'],
            'max_size': 10 * 1024 * 1024  # 10MB
        }
    }

    def __init__(self):
        """파일 저장소 초기화"""
        # Docker 환경과 로컬 환경 구분
        if os.path.exists('/app'):
            self.root_path = Path('/app/uploads')
        else:
            self.root_path = Path('uploads')

        # 루트 디렉토리 생성
        self.root_path.mkdir(parents=True, exist_ok=True)

    def get_date_path(self) -> str:
        """날짜 기반 경로 생성 (YYYY/MM/DD)"""
        now = datetime.now()
        return f"{now.year}/{now.month:02d}/{now.day:02d}"

    def validate_file(self, file: UploadFile, file_type: str) -> None:
        """파일 유효성 검증"""
        config = self.FILE_CONFIGS.get(file_type)
        if not config:
            raise HTTPException(status_code=400, detail=f"Invalid file type: {file_type}")

        # 파일 확장자 검증
        file_extension = Path(file.filename).suffix.lower()
        if file_extension not in config['allowed_extensions']:
            allowed = ', '.join(config['allowed_extensions'])
            raise HTTPException(
                status_code=400,
                detail=f"Invalid file type. Allowed types: {allowed}"
            )

        # 파일 크기 검증 (실제 읽어서 확인)
        # file.file.seek(0, 2)  # 파일 끝으로 이동
        # file_size = file.file.tell()  # 현재 위치 = 파일 크기
        # file.file.seek(0)  # 다시 처음으로

        # if file_size > config['max_size']:
        #     max_mb = config['max_size'] / 1024 / 1024
        #     raise HTTPException(
        #         status_code=400,
        #         detail=f"File too large. Maximum size: {max_mb}MB"
        #     )

    async def save_file(
        self,
        file: UploadFile,
        file_type: str,
        custom_name: Optional[str] = None
    ) -> str:
        """파일 저장 및 경로 반환"""
        import logging
        logger = logging.getLogger(__name__)

        logger.info(f"Saving file: {file.filename}, type: {file_type}")

        # 파일 유효성 검증
        self.validate_file(file, file_type)

        # 설정 가져오기
        config = self.FILE_CONFIGS[file_type]

        # 디렉토리 경로 생성 (타입/날짜)
        date_path = self.get_date_path()
        dir_path = self.root_path / config['base_path'] / date_path
        dir_path.mkdir(parents=True, exist_ok=True)

        logger.info(f"Directory path: {dir_path}")

        # 파일명 생성
        file_extension = Path(file.filename).suffix.lower()
        if custom_name:
            filename = f"{custom_name}{file_extension}"
        else:
            # UUID로 고유한 파일명 생성
            filename = f"{uuid.uuid4().hex[:16]}{file_extension}"

        # 전체 파일 경로
        file_path = dir_path / filename
        logger.info(f"Full file path: {file_path}")

        # 파일 저장
        try:
            # 파일 내용을 읽어서 저장
            content = await file.read()
            logger.info(f"Read {len(content)} bytes from upload")

            with open(file_path, 'wb') as f:
                f.write(content)

            logger.info(f"File saved successfully: {file_path}")

            # 상대 경로 반환 (uploads 폴더 기준)
            relative_path = str(file_path.relative_to(self.root_path))
            relative_path = relative_path.replace('\\', '/')
            logger.info(f"Returning relative path: {relative_path}")

            return relative_path

        except Exception as e:
            logger.error(f"Failed to save file: {str(e)}")
            # 저장 실패 시 파일 삭제
            if file_path.exists():
                file_path.unlink()
            raise HTTPException(status_code=500, detail=f"Failed to save file: {str(e)}")

    def get_full_path(self, relative_path: str) -> Path:
        """상대 경로를 전체 경로로 변환"""
        return self.root_path / relative_path

    def delete_file(self, relative_path: str) -> bool:
        """파일 삭제"""
        try:
            full_path = self.get_full_path(relative_path)
            if full_path.exists():
                full_path.unlink()
                return True
            return False
        except Exception:
            return False

    def file_exists(self, relative_path: str) -> bool:
        """파일 존재 여부 확인"""
        full_path = self.get_full_path(relative_path)
        return full_path.exists()

    def get_file_url(self, relative_path: str, base_url: str = "/uploads") -> str:
        """파일 접근 URL 생성"""
        return f"{base_url}/{relative_path}"

# 싱글톤 인스턴스
file_storage = FileStorage()