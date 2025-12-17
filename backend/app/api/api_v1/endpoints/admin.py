"""
관리자 전용 엔드포인트
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.api.deps import get_db, get_current_user
from app.models.user import User
from app.models.sale import Sale

router = APIRouter()

@router.post("/reset-file-urls")
def reset_file_urls(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """모든 판매의 파일 URL 초기화 (관리자 전용)"""
    if current_user.role.value != "admin":
        raise HTTPException(status_code=403, detail="Admin only")

    # 모든 판매의 파일 URL 초기화
    sales = db.query(Sale).filter(
        (Sale.transaction_statement_url != None) |
        (Sale.tax_invoice_url != None)
    ).all()

    count = 0
    for sale in sales:
        sale.transaction_statement_url = None
        sale.tax_invoice_url = None
        count += 1

    db.commit()

    return {
        "message": f"Reset {count} sales file URLs",
        "count": count
    }