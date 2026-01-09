from fastapi import APIRouter, UploadFile, File, Depends, HTTPException
from sqlalchemy.orm import Session
from app.api.deps import get_db, get_current_user
from app.models.user import User
import os
import uuid
from pathlib import Path
import shutil

router = APIRouter()

# 업로드 디렉토리 설정 (Docker 환경과 로컬 환경 구분)
if os.path.exists('/app'):
    UPLOAD_DIR = Path("/app/uploads")
else:
    UPLOAD_DIR = Path("uploads")
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

# 영수증 디렉토리
RECEIPT_DIR = UPLOAD_DIR / "receipts"
RECEIPT_DIR.mkdir(parents=True, exist_ok=True)

@router.post("/receipt")
async def upload_receipt(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user)
):
    """영수증 이미지 업로드"""
    # 파일 확장자 체크
    allowed_extensions = [".jpg", ".jpeg", ".png", ".pdf"]
    file_ext = Path(file.filename).suffix.lower()

    if file_ext not in allowed_extensions:
        raise HTTPException(
            status_code=400,
            detail=f"지원하지 않는 파일 형식입니다. ({', '.join(allowed_extensions)}만 가능)"
        )

    # 파일 크기 제한 (10MB)
    max_size = 10 * 1024 * 1024
    file_size = 0
    file_content = await file.read()
    file_size = len(file_content)

    if file_size > max_size:
        raise HTTPException(
            status_code=400,
            detail="파일 크기가 10MB를 초과합니다."
        )

    # 파일명 생성 (UUID + 확장자)
    file_id = str(uuid.uuid4())
    file_name = f"{file_id}{file_ext}"
    file_path = RECEIPT_DIR / file_name

    # 파일 저장
    with open(file_path, "wb") as f:
        f.write(file_content)

    # URL 반환
    file_url = f"/uploads/receipts/{file_name}"

    return {
        "file_url": file_url,
        "file_name": file.filename,
        "file_size": file_size
    }

@router.delete("/receipt")
async def delete_receipt(
    file_url: str,
    current_user: User = Depends(get_current_user)
):
    """영수증 이미지 삭제"""
    try:
        # URL에서 파일명 추출
        file_name = file_url.split("/")[-1]
        file_path = RECEIPT_DIR / file_name

        if file_path.exists():
            os.remove(file_path)
            return {"message": "파일이 삭제되었습니다."}
        else:
            raise HTTPException(status_code=404, detail="파일을 찾을 수 없습니다.")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))