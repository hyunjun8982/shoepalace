"""
기존 판매 데이터의 status를 total_company_amount 기준으로 업데이트
"""
import sys
from pathlib import Path

# 프로젝트 루트를 Python 경로에 추가
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

from sqlalchemy.orm import Session
from app.db.database import SessionLocal
from app.models.sale import Sale, SaleStatus

def update_sales_status():
    """판매 데이터의 status 업데이트"""
    db: Session = SessionLocal()

    try:
        # 모든 판매 조회
        sales = db.query(Sale).all()

        updated_count = 0
        for sale in sales:
            old_status = sale.status

            # total_company_amount가 있고 0보다 크면 COMPLETED, 아니면 PENDING
            if sale.total_company_amount and sale.total_company_amount > 0:
                sale.status = SaleStatus.COMPLETED
            else:
                sale.status = SaleStatus.PENDING

            if old_status != sale.status:
                updated_count += 1
                print(f"Sale {sale.sale_number}: {old_status.value} -> {sale.status.value}")

        db.commit()
        print(f"\n총 {len(sales)}개 판매 중 {updated_count}개 상태 업데이트 완료")

    except Exception as e:
        print(f"오류 발생: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    print("판매 데이터 상태 업데이트 시작...")
    update_sales_status()
    print("완료!")
