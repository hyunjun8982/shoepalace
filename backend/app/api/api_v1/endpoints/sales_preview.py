"""
판매 문서 미리보기 엔드포인트
"""
from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session
import pandas as pd
from app.api.deps import get_db, get_current_user
from app.models.user import User
from app.models.sale import Sale
from app.core.file_storage import file_storage

router = APIRouter()

@router.get("/{sale_id}/transaction-statement-preview")
def preview_transaction_statement(
    sale_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """거래명세서 내용 미리보기"""
    sale = db.query(Sale).filter(Sale.id == sale_id).first()
    if not sale:
        raise HTTPException(status_code=404, detail="Sale not found")

    # 권한 체크
    if current_user.role.value == "seller" and str(sale.seller_id) != str(current_user.id):
        raise HTTPException(status_code=403, detail="Not authorized")

    if not sale.transaction_statement_url:
        raise HTTPException(status_code=404, detail="Transaction statement not found")

    # 파일 경로 가져오기
    file_path = file_storage.get_full_path(sale.transaction_statement_url)
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found")

    try:
        # 엑셀 파일 읽기
        if file_path.suffix.lower() in ['.xlsx', '.xls']:
            df = pd.read_excel(file_path, nrows=100)  # 최대 100행만 읽기
        elif file_path.suffix.lower() == '.csv':
            df = pd.read_csv(file_path, nrows=100)
        else:
            raise HTTPException(status_code=400, detail="Unsupported file format")

        # NaN 값을 빈 문자열로 대체하고 모든 값을 문자열로 변환
        df = df.fillna('')

        # 날짜 형식 처리
        for col in df.columns:
            if df[col].dtype == 'datetime64[ns]':
                df[col] = df[col].astype(str)

        # DataFrame을 JSON으로 변환
        result = {
            "columns": df.columns.tolist(),
            "data": df.values.tolist(),
            "total_rows": len(df),
            "file_name": file_path.name
        }

        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to read file: {str(e)}")