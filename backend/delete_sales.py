#!/usr/bin/env python3
"""기존 판매 데이터 삭제 스크립트"""

import sys
import os
from pathlib import Path

# 프로젝트 루트를 Python path에 추가
backend_root = Path(__file__).parent
sys.path.insert(0, str(backend_root))
os.chdir(str(backend_root))

from app.db.database import SessionLocal
from app.models.sale import Sale, SaleItem
from app.models.warehouse import Warehouse  # 관계 설정을 위해 필요
from app.models.purchase import Purchase, PurchaseItem  # 관계 설정을 위해 필요

def delete_all_sales():
    """모든 판매 데이터 삭제"""
    db = SessionLocal()
    try:
        # 판매 아이템 삭제
        items_count = db.query(SaleItem).count()
        db.query(SaleItem).delete()
        print(f"판매 아이템 {items_count}개 삭제")

        # 판매 삭제
        sales_count = db.query(Sale).count()
        db.query(Sale).delete()
        print(f"판매 {sales_count}개 삭제")

        db.commit()
        print("\n모든 판매 데이터가 삭제되었습니다.")
    except Exception as e:
        print(f"오류 발생: {str(e)}")
        db.rollback()
        raise
    finally:
        db.close()

if __name__ == "__main__":
    print("=" * 60)
    print("판매 데이터 삭제 스크립트")
    print("=" * 60)
    print()

    # 환경 변수로 강제 실행 지원
    if os.environ.get('FORCE_DELETE') == '1':
        delete_all_sales()
    else:
        confirm = input("정말로 모든 판매 데이터를 삭제하시겠습니까? (yes/no): ")
        if confirm.lower() == 'yes':
            delete_all_sales()
        else:
            print("취소되었습니다.")
