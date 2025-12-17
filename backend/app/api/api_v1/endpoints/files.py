"""
파일 서빙 엔드포인트
"""
from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import FileResponse
from pathlib import Path
from app.api.deps import get_current_user
from app.models.user import User
from app.core.file_storage import file_storage

router = APIRouter()

@router.get("/{file_path:path}")
def serve_file(
    file_path: str,
    current_user: User = Depends(get_current_user)
):
    """파일 서빙"""
    # 파일 경로 가져오기
    full_path = file_storage.get_full_path(file_path)

    if not full_path.exists():
        raise HTTPException(status_code=404, detail="File not found")

    # MIME 타입 설정
    mime_types = {
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.png': 'image/png',
        '.pdf': 'application/pdf',
        '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        '.xls': 'application/vnd.ms-excel',
        '.csv': 'text/csv',
    }

    file_extension = full_path.suffix.lower()
    media_type = mime_types.get(file_extension, 'application/octet-stream')

    return FileResponse(
        path=full_path,
        filename=full_path.name,
        media_type=media_type
    )