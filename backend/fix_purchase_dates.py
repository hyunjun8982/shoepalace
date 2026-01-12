#!/usr/bin/env python
"""구매 날짜 수정 스크립트 - 엑셀 순서대로 연도 재계산"""

import sys
import os
from pathlib import Path
from datetime import datetime, timedelta
import pandas as pd

# 프로젝트 루트를 Python path에 추가
backend_root = Path(__file__).parent
sys.path.insert(0, str(backend_root))
os.chdir(str(backend_root))

from app.db.database import SessionLocal
from app.models.purchase import Purchase, PurchaseItem
from app.models.warehouse import Warehouse  # 관계 설정을 위해 필요
from app.models.product import Product  # 관계 설정을 위해 필요
from sqlalchemy import func

def fix_purchase_dates(excel_path: str):
    """구매 날짜 수정 - 엑셀의 날짜를 DB에 그대로 적용"""
    db = SessionLocal()

    try:
        # 엑셀 파일 읽기
        print(f"엑셀 파일 읽는 중: {excel_path}")
        df = pd.read_excel(excel_path, sheet_name='구매리스트', header=1)

        # 날짜가 있는 행만 필터링
        date_col = df.columns[1]  # 날짜 컬럼
        df = df[pd.notna(df[date_col])].copy()

        # 날짜 파싱 (오류 처리 포함)
        df['excel_date'] = pd.to_datetime(df[date_col], errors='coerce')

        # 파싱 실패한 행 제거
        invalid_dates = df[df['excel_date'].isna()]
        if len(invalid_dates) > 0:
            print(f"⚠️  경고: {len(invalid_dates)}개의 잘못된 날짜를 건너뜁니다.")
            for idx, row in invalid_dates.iterrows():
                print(f"   Row {idx+2}: {row[date_col]}")

        df = df[df['excel_date'].notna()].copy()

        print(f"엑셀 데이터: {len(df)}건")
        print(f"날짜 범위: {df['excel_date'].min()} ~ {df['excel_date'].max()}")

        # 데이터베이스에서 다희 계정의 구매 내역 조회 (생성일시 순 = 엑셀 순서와 동일)
        from app.models.user import User
        purchases = db.query(Purchase)\
            .join(User, Purchase.buyer_id == User.id)\
            .filter(User.username == 'dhkim')\
            .order_by(Purchase.created_at)\
            .all()

        print(f"\n데이터베이스 구매 내역: {len(purchases)}건")

        if len(purchases) != len(df):
            print(f"⚠️  경고: 엑셀({len(df)}건)과 DB({len(purchases)}건)의 데이터 개수가 다릅니다!")
            response = input("계속 진행하시겠습니까? (yes/no): ")
            if response.lower() != 'yes':
                print("취소되었습니다.")
                return

        # 날짜 매핑 및 수정
        print("\n날짜 수정 중...")
        print("엑셀 파일의 날짜를 데이터베이스에 그대로 적용합니다.")
        print("(제일 위 = 과거, 제일 아래 = 최신)")
        print()

        updated_count = 0

        for idx, purchase in enumerate(purchases):
            if idx >= len(df):
                print(f"⚠️  경고: Purchase {idx+1}번이 엑셀 데이터를 초과합니다.")
                break

            excel_row = df.iloc[idx]
            excel_date = excel_row['excel_date'].date()
            current_date = purchase.purchase_date

            if excel_date != current_date:
                old_date = purchase.purchase_date
                purchase.purchase_date = excel_date
                updated_count += 1

                if updated_count <= 10 or updated_count % 100 == 0:
                    print(f"  {updated_count}. Purchase #{idx+1} ({purchase.transaction_no}): {old_date} → {excel_date}")

        # 변경사항 저장
        db.commit()
        print(f"\n✓ 완료: {updated_count}건의 날짜가 수정되었습니다.")

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
    # Docker 컨테이너 내부에서는 /tmp 경로 사용
    excel_path = "/tmp/purchase_list.xlsx" if os.path.exists("/tmp/purchase_list.xlsx") else r"C:\Users\hyunj\Downloads\[매입]다희_구매리스트.xlsx"

    if not os.path.exists(excel_path):
        print(f"파일을 찾을 수 없습니다: {excel_path}")
        sys.exit(1)

    print("=" * 60)
    print("구매 날짜 수정 스크립트")
    print("=" * 60)
    print()
    print("⚠️  주의: 이 스크립트는 기존 구매 날짜를 엑셀 파일 기준으로 수정합니다.")
    print()

    # 환경 변수로 강제 실행 지원
    if os.environ.get('FORCE_UPDATE') == '1':
        fix_purchase_dates(excel_path)
    else:
        confirm = input("계속 진행하시겠습니까? (yes/no): ")
        if confirm.lower() == 'yes':
            fix_purchase_dates(excel_path)
        else:
            print("취소되었습니다.")
