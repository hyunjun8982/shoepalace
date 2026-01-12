#!/usr/bin/env python
"""구매 날짜 수정 스크립트 - 구매번호에서 날짜 추출"""

import sys
import os
from pathlib import Path
from datetime import datetime
import re

# 프로젝트 루트를 Python path에 추가
backend_root = Path(__file__).parent
sys.path.insert(0, str(backend_root))
os.chdir(str(backend_root))

from app.db.database import SessionLocal
from app.models.purchase import Purchase, PurchaseItem
from app.models.warehouse import Warehouse  # 관계 설정을 위해 필요
from app.models.product import Product  # 관계 설정을 위해 필요
from app.models.user import User

def parse_date_from_transaction_no(transaction_no: str):
    """구매번호에서 날짜 추출

    형식: DHB-YYMMDD-XXXX-...
    예: DHB-241118-0104-FZ3863-300 -> 2024-11-18
    """
    if not transaction_no:
        return None

    # DHB-YYMMDD 패턴 추출
    pattern = r'DHB-(\d{6})'
    match = re.match(pattern, transaction_no)

    if not match:
        return None

    date_str = match.group(1)  # YYMMDD

    try:
        # YY를 20YY로 변환
        year = 2000 + int(date_str[0:2])
        month = int(date_str[2:4])
        day = int(date_str[4:6])

        return datetime(year, month, day).date()
    except ValueError:
        return None


def fix_purchase_dates():
    """구매번호에서 날짜를 추출하여 purchase_date 업데이트"""
    db = SessionLocal()

    try:
        print("데이터베이스 구매 내역 조회 중...")

        # dhkim 계정의 모든 구매 내역
        purchases = db.query(Purchase)\
            .join(User, Purchase.buyer_id == User.id)\
            .filter(User.username == 'dhkim')\
            .order_by(Purchase.transaction_no)\
            .all()

        print(f"총 구매 내역: {len(purchases)}건")
        print()
        print("날짜 수정 중...")
        print()

        updated_count = 0
        no_match_count = 0

        for purchase in purchases:
            # 구매번호에서 날짜 추출
            new_date = parse_date_from_transaction_no(purchase.transaction_no)

            if not new_date:
                no_match_count += 1
                if no_match_count <= 10:
                    print(f"  ⚠️  날짜 추출 실패: {purchase.transaction_no}")
                continue

            # 날짜가 다르면 업데이트
            if purchase.purchase_date != new_date:
                old_date = purchase.purchase_date
                purchase.purchase_date = new_date
                updated_count += 1

                if updated_count <= 10 or updated_count % 100 == 0:
                    print(f"  {updated_count}. {purchase.transaction_no}: {old_date} → {new_date}")

        # 변경사항 저장
        db.commit()
        print()
        print(f"✓ 완료: {updated_count}건의 날짜가 수정되었습니다.")

        if no_match_count > 0:
            print(f"⚠️  날짜 추출 실패: {no_match_count}건")

        if updated_count == 0:
            print("⚠️  모든 날짜가 이미 일치합니다. 변경사항이 없습니다.")

    except Exception as e:
        print(f"오류 발생: {str(e)}")
        import traceback
        traceback.print_exc()
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    print("=" * 60)
    print("구매 날짜 수정 스크립트 (구매번호 기반)")
    print("=" * 60)
    print()
    print("⚠️  주의: 구매번호(DHB-YYMMDD-XXXX)에서 날짜를 추출하여 purchase_date를 수정합니다.")
    print()

    # 환경 변수로 강제 실행 지원
    if os.environ.get('FORCE_UPDATE') == '1':
        fix_purchase_dates()
    else:
        confirm = input("계속 진행하시겠습니까? (yes/no): ")
        if confirm.lower() == 'yes':
            fix_purchase_dates()
        else:
            print("취소되었습니다.")
