"""
테스트 업로드 엔드포인트
"""
from fastapi import APIRouter, UploadFile, File, Form
from typing import Optional
import logging

router = APIRouter()
logger = logging.getLogger(__name__)

@router.post("/simple")
async def test_simple_upload(file: UploadFile = File(...)):
    """간단한 파일 업로드 테스트"""
    logger.info(f"Received file: {file.filename}")
    content = await file.read()
    return {
        "filename": file.filename,
        "content_type": file.content_type,
        "size": len(content)
    }

@router.post("/with-form")
async def test_upload_with_form(
    description: str = Form(None),
    file: UploadFile = File(...)
):
    """폼 데이터와 함께 파일 업로드 테스트"""
    content = await file.read()
    return {
        "description": description,
        "filename": file.filename,
        "content_type": file.content_type,
        "size": len(content)
    }