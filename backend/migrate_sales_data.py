#!/usr/bin/env python3
"""
판매 데이터 이관 스크립트
[도매]호남 판매 내역서.xlsx 파일의 '도매 리스트' 시트 데이터를 DB에 이관합니다.
"""

import sys
import os
from pathlib import Path
import pandas as pd
from datetime import datetime
from sqlalchemy.orm import Session
from uuid import uuid4

# 프로젝트 루트를 Python path에 추가
project_root = Path(__file__).parent.parent
backend_root = Path(__file__).parent
sys.path.insert(0, str(backend_root))
os.chdir(str(backend_root))

from app.db.database import SessionLocal
from app.models.product import Product
from app.models.brand import Brand
from app.models.sale import Sale, SaleItem, SaleProgressStatus
from app.models.user import User
from app.models.warehouse import Warehouse  # 관계 설정을 위해 필요
from app.models.purchase import Purchase, PurchaseItem  # 관계 설정을 위해 필요


def get_or_create_brand(db: Session, brand_name: str) -> Brand:
    """브랜드가 없으면 생성"""
    brand = db.query(Brand).filter(Brand.name == brand_name).first()
    if not brand:
        brand = Brand(
            id=uuid4(),
            name=brand_name,
            description=f"{brand_name} 브랜드",
            is_active=True
        )
        db.add(brand)
        db.commit()
        db.refresh(brand)
        print(f"  - 새 브랜드 생성: {brand_name}")
    return brand


def get_or_create_product(db: Session, product_code: str, brand_id: str = None) -> Product:
    """상품이 없으면 품번만으로 생성"""
    product = db.query(Product).filter(Product.product_code == product_code).first()
    if not product:
        product = Product(
            id=uuid4(),
            brand_id=brand_id,
            product_code=product_code,
            product_name=product_code,  # 품번을 상품명으로
            category=None,  # 카테고리 없음
            description=None
        )
        db.add(product)
        db.commit()
        db.refresh(product)
        print(f"  - 새 상품 생성: {product_code}")
    return product


def get_honam_user(db: Session) -> User:
    """호남 계정 조회"""
    user = db.query(User).filter(User.username == "honam").first()
    if not user:
        raise Exception("호남 계정이 존재하지 않습니다. 먼저 호남 계정을 생성해주세요.")
    return user


def map_progress_status(progress_text: str) -> SaleProgressStatus:
    """진행사항 텍스트를 Enum으로 매핑"""
    if pd.isna(progress_text):
        return None

    progress_map = {
        '부분출고': SaleProgressStatus.partial_shipped,
        '출고완료': SaleProgressStatus.shipped,
        '계약금': SaleProgressStatus.deposit,
        '환불': SaleProgressStatus.refund,
        '추가 입금': SaleProgressStatus.additional_payment,
        '수량부족': SaleProgressStatus.out_of_stock,
    }

    return progress_map.get(str(progress_text).strip(), None)


def migrate_sales_data(excel_path: str):
    """판매 데이터 이관"""
    db = SessionLocal()

    try:
        # 엑셀 파일 읽기
        print(f"엑셀 파일 읽는 중: {excel_path}")
        df = pd.read_excel(excel_path, sheet_name='도매 리스트', header=1)

        # 날짜가 있는 행만 필터링 (빈 행 제외)
        df_filtered = df.dropna(subset=['날짜'])
        print(f"총 {len(df_filtered)}개의 판매 데이터를 처리합니다.\n")

        # 호남 계정 조회
        honam_user = get_honam_user(db)
        print(f"판매자: {honam_user.username} ({honam_user.full_name})\n")

        # 데이터 이관
        created_count = 0
        skipped_count = 0

        for idx, row in df_filtered.iterrows():
            try:
                # 필수 데이터 확인
                sale_date = row['날짜']
                product_code = row['품번']

                if pd.isna(product_code):
                    print(f"행 {idx+2}: 품번이 없어 스킵합니다.")
                    skipped_count += 1
                    continue

                # 날짜 변환
                if isinstance(sale_date, str):
                    sale_date = datetime.strptime(sale_date, '%Y-%m-%d')
                else:
                    sale_date = pd.to_datetime(sale_date)

                # 브랜드 처리
                brand_name = row['브랜드']
                brand = None
                if pd.notna(brand_name):
                    brand = get_or_create_brand(db, str(brand_name).strip())

                # 상품 처리
                product_code = str(product_code).strip()
                product = get_or_create_product(
                    db,
                    product_code,
                    brand_id=str(brand.id) if brand else None
                )

                # 판매 가격 계산
                selling_price = row['판매가격'] if pd.notna(row['판매가격']) else 0
                total_amount = row['판매가합계'] if pd.notna(row['판매가합계']) else 0
                seller_margin = row['호남 이윤 합계'] if pd.notna(row['호남 이윤 합계']) else 0

                # 회사 판매가 = 판매가합계 - 판매자 마진
                company_price = total_amount - seller_margin

                # 수량
                quantity = int(row['총 수량']) if pd.notna(row['총 수량']) else 1

                # 출고회사 (고객명)
                customer = row['출고회사'] if pd.notna(row['출고회사']) else None

                # 상태 (마진이 있으면 완료, 없으면 진행중)
                status = 'completed' if pd.notna(row['호남 이윤 합계']) else 'pending'

                # 진행 상황
                progress_status = map_progress_status(row.get('진행사항'))

                # 판매번호 생성 (날짜 + 순번)
                sale_number = f"S{sale_date.strftime('%y%m%d')}-{created_count+1:04d}"

                # 판매 생성
                sale = Sale(
                    id=uuid4(),
                    sale_number=sale_number,
                    sale_date=sale_date,
                    customer_name=customer,
                    seller_id=honam_user.id,
                    total_seller_amount=total_amount,  # 판매자 판매가
                    total_company_amount=company_price,  # 회사 판매가
                    total_seller_margin=seller_margin,  # 판매자 마진
                    status=status,
                    progress_status=progress_status,  # 진행 상황
                    notes=f"도매 리스트에서 이관 (행 {idx+2})",
                    created_at=datetime.now(),
                    updated_at=datetime.now()
                )
                db.add(sale)
                db.flush()  # ID 생성을 위해 flush

                # 판매 아이템 생성 (사이즈별 정보 없음 - FREE로 처리)
                sale_item = SaleItem(
                    id=uuid4(),
                    sale_id=sale.id,
                    product_id=product.id,
                    product_name=product.product_name,
                    size='FREE',  # 사이즈 정보 없음
                    quantity=quantity,
                    seller_sale_price_original=selling_price,  # 원화 가격
                    seller_sale_currency='KRW',  # 원화
                    seller_sale_price_krw=selling_price,  # 원화 가격
                    company_sale_price=company_price / quantity if quantity > 0 else 0,  # 개당 회사 판매가
                    seller_margin=seller_margin / quantity if quantity > 0 else 0,  # 개당 마진
                    created_at=datetime.now()
                )
                db.add(sale_item)

                db.commit()
                created_count += 1

                if created_count % 50 == 0:
                    print(f"진행 중: {created_count}개 생성됨...")

            except Exception as e:
                print(f"행 {idx+2} 처리 중 오류: {str(e)}")
                db.rollback()
                skipped_count += 1
                continue

        print(f"\n이관 완료!")
        print(f"- 생성됨: {created_count}개")
        print(f"- 스킵됨: {skipped_count}개")

    except Exception as e:
        print(f"오류 발생: {str(e)}")
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    # Docker 컨테이너 내부에서는 /tmp/sales.xlsx 사용
    excel_path = "/tmp/sales.xlsx" if os.path.exists("/tmp/sales.xlsx") else r"C:\Users\hyunj\Downloads\[도매]호남 판매 내역서.xlsx"

    if not os.path.exists(excel_path):
        print(f"파일을 찾을 수 없습니다: {excel_path}")
        sys.exit(1)

    print("=" * 60)
    print("판매 데이터 이관 스크립트")
    print("=" * 60)
    print()

    migrate_sales_data(excel_path)
