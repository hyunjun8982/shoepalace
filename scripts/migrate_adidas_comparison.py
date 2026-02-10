"""
아디다스 구매/판매 비교 데이터 이관 스크립트

엑셀 파일 3개를 파싱하여 adidas_comparison_purchases / adidas_comparison_sales 테이블에 삽입

사용법:
  python scripts/migrate_adidas_comparison.py --dry-run       # 테스트 (DB 반영 안함)
  python scripts/migrate_adidas_comparison.py                  # 실제 실행
  python scripts/migrate_adidas_comparison.py --clear          # 기존 데이터 삭제 후 실행
  python scripts/migrate_adidas_comparison.py --purchases-only # 구매내역만
  python scripts/migrate_adidas_comparison.py --sales-only     # 판매내역만
"""

import sys
import os
import re
import argparse
import uuid
from datetime import datetime, date

import pandas as pd
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

# 데이터베이스 연결
DATABASE_URL = os.environ.get(
    "DATABASE_URL",
    "postgresql://shoepalace_user:shoepalace_pass@129.212.227.252:5433/shoepalace"
)

# 엑셀 파일 경로
BASE_PATH = r"C:\개인\01_shoepalace\01_입출고관리시스템\구매_재고_내역_비교_20260210"
DAHEE_FILE = os.path.join(BASE_PATH, "다희_구매내역.xlsx")
INSER_FILE = os.path.join(BASE_PATH, "인서_구매내역.xlsx")
SALES_FILE = os.path.join(BASE_PATH, "호남_판매_내역.xlsx")

# 의류 사이즈 목록 (탐지용)
CLOTHING_SIZES = {"XXS", "XS", "S", "M", "L", "XL", "2XL", "3XL", "4XL", "XXXXL", "FREE"}
# 신발 사이즈 범위
SHOE_SIZE_RANGE = range(220, 310, 5)


def clean_product_code(raw_code):
    """품번 정제: 괄호/접미사 분리"""
    if pd.isna(raw_code):
        return None, None

    code = str(raw_code).strip()
    if not code:
        return None, None

    note = None

    # 패턴1: JC6000(xxx) → code=JC6000, note=xxx
    match = re.match(r'^([A-Za-z0-9-]+)\((.+)\)$', code)
    if match:
        return match.group(1).strip().upper(), match.group(2).strip()

    # 패턴2: KL0271노쿠폰 → code=KL0271, note=노쿠폰
    match = re.match(r'^([A-Za-z0-9-]+)([\uac00-\ud7af].+)$', code)
    if match:
        return match.group(1).strip().upper(), match.group(2).strip()

    return code.upper(), note


def safe_int(value):
    """안전한 정수 변환"""
    if pd.isna(value):
        return 0
    try:
        v = float(value)
        return int(v) if v > 0 else 0
    except (ValueError, TypeError):
        return 0


def safe_price(value):
    """안전한 가격 변환"""
    if pd.isna(value):
        return None
    try:
        v = float(str(value).replace(",", ""))
        return int(v) if v > 0 else None
    except (ValueError, TypeError):
        return None


def detect_size_columns(header_row):
    """헤더 행에서 사이즈 컬럼 매핑 탐지"""
    size_map = {}
    for col_idx, val in enumerate(header_row):
        if pd.isna(val):
            continue
        val_str = str(val).strip()

        # 신발 사이즈 (220, 225, ... 305)
        try:
            num = int(float(val_str))
            if 220 <= num <= 310:
                size_map[col_idx] = str(num)
                continue
        except (ValueError, TypeError):
            pass

        # 의류 사이즈
        val_upper = val_str.upper()
        if val_upper in CLOTHING_SIZES:
            size_map[col_idx] = val_upper
            continue

        # 2XL, 3XL 등
        if re.match(r'^\d?XL$', val_upper) or val_upper in {"XXS", "XXXXL"}:
            size_map[col_idx] = val_upper

    return size_map


# =============================================================================
# 다희 구매내역 파싱
# =============================================================================

def parse_dahee_two_section(df, sheet_name):
    """다희 2섹션 형식 (의류/신발 구분) 파싱"""
    records = []
    current_category = None
    size_map = {}

    for i in range(len(df)):
        row = df.iloc[i]
        first_cell = str(row.iloc[0]).strip() if pd.notna(row.iloc[0]) else ""

        # 섹션 헤더 탐지 (예: "남동점_의류", "남동점_신발", "구포_의류" 등)
        if "의류" in first_cell:
            current_category = "의류"
            # 다음 행이나 현재 행에서 사이즈 컬럼 탐지
            size_map = detect_size_columns(row)
            if not size_map:
                # 현재 행의 나머지 셀에서 사이즈 탐지
                size_map = detect_size_columns(row)
            continue
        elif "신발" in first_cell:
            current_category = "신발"
            size_map = detect_size_columns(row)
            continue

        # 사이즈 헤더 행인지 확인 (품번 행이 아닌데 사이즈가 있는 행)
        detected = detect_size_columns(row)
        if len(detected) >= 3 and not re.match(r'^[A-Za-z]', first_cell):
            size_map = detected
            continue

        # 데이터 행: 첫 셀이 품번인 경우
        if not first_cell or not re.match(r'^[A-Za-z]', first_cell):
            continue

        product_code = first_cell.upper()

        if not size_map:
            # 사이즈 맵 없으면 합계 컬럼만 사용
            total_col = len(row) - 1
            qty = safe_int(row.iloc[total_col])
            if qty > 0:
                records.append({
                    "product_code": product_code,
                    "size": None,
                    "quantity": qty,
                    "unit_price": None,
                    "buyer_name": "다희",
                    "source": sheet_name,
                    "category": current_category,
                    "note": None,
                })
        else:
            for col_idx, size in size_map.items():
                if col_idx < len(row):
                    qty = safe_int(row.iloc[col_idx])
                    if qty > 0:
                        records.append({
                            "product_code": product_code,
                            "size": size,
                            "quantity": qty,
                            "unit_price": None,
                            "buyer_name": "다희",
                            "source": sheet_name,
                            "category": current_category,
                            "note": None,
                        })

    return records


def parse_dahee_simple_list(df, sheet_name):
    """다희 단순 리스트 + 사이즈 섹션 형식 (모다김제 등) 파싱"""
    records = []

    # 상단 단순 리스트에서 가격 정보 수집
    price_map = {}
    header_row_idx = None
    for i in range(min(5, len(df))):
        row_str = str(df.iloc[i].iloc[0]).strip() if pd.notna(df.iloc[i].iloc[0]) else ""
        if "품번" in row_str:
            header_row_idx = i
            break

    start_row = (header_row_idx + 1) if header_row_idx is not None else 1

    # 단순 리스트 끝 찾기 (빈 행이 나올 때까지)
    simple_end = start_row
    for i in range(start_row, len(df)):
        if pd.isna(df.iloc[i].iloc[0]):
            simple_end = i
            break
    else:
        simple_end = len(df)

    for i in range(start_row, simple_end):
        row = df.iloc[i]
        code_raw = row.iloc[0]
        if pd.isna(code_raw):
            continue
        code_str = str(code_raw).strip().upper()
        if not code_str or not re.match(r'^[A-Z]', code_str):
            continue
        price = safe_price(row.iloc[3]) if len(row) > 3 else None
        if price:
            price_map[code_str] = price

    # 사이즈 섹션 파싱 ("1차 최종", "2차 최종", "1차 사이즈" 등)
    has_size_section = False
    size_section_records = []
    i = simple_end
    while i < len(df):
        row = df.iloc[i]
        first_cell = str(row.iloc[0]).strip() if pd.notna(row.iloc[0]) else ""

        # 사이즈 섹션 헤더 탐지 ("1차", "2차" 등 + 최종/사이즈)
        if re.match(r'^\d+차', first_cell):
            has_size_section = True
            # 다음 행이 사이즈 컬럼 헤더
            i += 1
            if i >= len(df):
                break
            size_header = df.iloc[i]
            size_map = detect_size_columns(size_header)
            i += 1

            # 데이터 행 파싱
            while i < len(df):
                data_row = df.iloc[i]
                code_raw = data_row.iloc[0]
                if pd.isna(code_raw):
                    break
                code_str = str(code_raw).strip().upper()
                if not code_str or not re.match(r'^[A-Z]', code_str):
                    break

                for col_idx, size in size_map.items():
                    if col_idx < len(data_row):
                        qty = safe_int(data_row.iloc[col_idx])
                        if qty > 0:
                            size_section_records.append({
                                "product_code": code_str,
                                "size": size,
                                "quantity": qty,
                                "unit_price": price_map.get(code_str),
                                "buyer_name": "다희",
                                "source": sheet_name,
                                "category": "의류",
                                "note": None,
                            })
                i += 1
        else:
            i += 1

    # 사이즈 섹션이 있으면 사이즈 섹션 데이터 사용
    if has_size_section and size_section_records:
        records = size_section_records
    else:
        # 사이즈 섹션 없으면 단순 리스트 사용
        for i in range(start_row, simple_end):
            row = df.iloc[i]
            code_raw = row.iloc[0]
            if pd.isna(code_raw):
                continue
            code_str = str(code_raw).strip().upper()
            if not code_str or not re.match(r'^[A-Z]', code_str):
                continue
            qty = safe_int(row.iloc[1]) if len(row) > 1 else 0
            price = safe_price(row.iloc[3]) if len(row) > 3 else None
            if qty > 0:
                records.append({
                    "product_code": code_str,
                    "size": None,
                    "quantity": qty,
                    "unit_price": price,
                    "buyer_name": "다희",
                    "source": sheet_name,
                    "category": None,
                    "note": None,
                })

    return records


def parse_dahee(dry_run=False):
    """다희 구매내역 전체 파싱"""
    print(f"\n{'='*60}")
    print(f"다희 구매내역 파싱: {DAHEE_FILE}")
    print(f"{'='*60}")

    if not os.path.exists(DAHEE_FILE):
        print(f"[오류] 파일 없음: {DAHEE_FILE}")
        return []

    xl = pd.ExcelFile(DAHEE_FILE)
    all_records = []

    for sheet_name in xl.sheet_names:
        print(f"\n  시트: {sheet_name}")
        df = pd.read_excel(DAHEE_FILE, sheet_name=sheet_name, header=None)

        if df.shape[0] == 0:
            print(f"    빈 시트 - 스킵")
            continue

        # 형식 감지: 첫 셀에 "의류" 또는 "신발" 포함 → 2섹션 형식
        # 아니면 단순 리스트
        has_section = False
        for i in range(min(5, len(df))):
            cell = str(df.iloc[i].iloc[0]) if pd.notna(df.iloc[i].iloc[0]) else ""
            if "의류" in cell or "신발" in cell:
                has_section = True
                break

        # 하남 시트 같이 사이즈 컬럼이 바로 있는 경우도 2섹션으로 처리
        if not has_section:
            first_row_sizes = detect_size_columns(df.iloc[0])
            if len(first_row_sizes) >= 3:
                has_section = True

        if has_section:
            records = parse_dahee_two_section(df, sheet_name)
        else:
            records = parse_dahee_simple_list(df, sheet_name)

        all_records.extend(records)
        total_qty = sum(r["quantity"] for r in records)
        print(f"    레코드: {len(records)}건, 총 수량: {total_qty}")

    print(f"\n  다희 총 레코드: {len(all_records)}건")
    return all_records


# =============================================================================
# 인서 구매내역 파싱
# =============================================================================

def parse_inser(dry_run=False):
    """인서 구매내역 전체 파싱"""
    print(f"\n{'='*60}")
    print(f"인서 구매내역 파싱: {INSER_FILE}")
    print(f"{'='*60}")

    if not os.path.exists(INSER_FILE):
        print(f"[오류] 파일 없음: {INSER_FILE}")
        return []

    xl = pd.ExcelFile(INSER_FILE)
    all_records = []

    for sheet_name in xl.sheet_names:
        print(f"\n  시트: {sheet_name}")
        df = pd.read_excel(INSER_FILE, sheet_name=sheet_name, header=None)

        if df.shape[0] < 3:
            print(f"    데이터 부족 - 스킵")
            continue

        # Row 0: 요약, Row 1: 헤더, Row 2+: 데이터
        header_row = df.iloc[1]

        # 사이즈 컬럼 매핑 (col 15~32 범위에서)
        size_map = {}
        for col_idx in range(13, min(39, len(header_row))):
            val = header_row.iloc[col_idx]
            if pd.isna(val):
                continue
            val_str = str(val).strip()

            # 신발 사이즈
            try:
                num = int(float(val_str))
                if 220 <= num <= 310:
                    size_map[col_idx] = str(num)
                    continue
            except (ValueError, TypeError):
                pass

            # 의류 사이즈
            val_upper = val_str.upper().replace(" ", "")
            if val_upper in CLOTHING_SIZES or re.match(r'^\d?X{0,3}[LS]$', val_upper):
                size_map[col_idx] = val_upper

        records = []
        for i in range(2, len(df)):
            row = df.iloc[i]
            code_raw = row.iloc[4] if len(row) > 4 else None  # 품번

            if pd.isna(code_raw):
                continue

            product_code, note = clean_product_code(code_raw)
            if not product_code:
                continue

            unit_price = safe_price(row.iloc[6]) if len(row) > 6 else None  # 구매가 (단가)
            total_qty = safe_int(row.iloc[14]) if len(row) > 14 else 0  # 총 수량

            if total_qty <= 0:
                # 총 수량이 없으면 사이즈별 합산
                total_qty = 0
                for col_idx in size_map:
                    if col_idx < len(row):
                        total_qty += safe_int(row.iloc[col_idx])

            if total_qty <= 0:
                continue

            # 사이즈별 레코드 생성
            has_sizes = False
            for col_idx, size in size_map.items():
                if col_idx < len(row):
                    qty = safe_int(row.iloc[col_idx])
                    if qty > 0:
                        has_sizes = True
                        records.append({
                            "product_code": product_code,
                            "size": size,
                            "quantity": qty,
                            "unit_price": unit_price,
                            "buyer_name": "인서",
                            "source": sheet_name,
                            "category": None,
                            "note": note,
                        })

            # 사이즈 정보 없으면 합계만
            if not has_sizes:
                records.append({
                    "product_code": product_code,
                    "size": None,
                    "quantity": total_qty,
                    "unit_price": unit_price,
                    "buyer_name": "인서",
                    "source": sheet_name,
                    "category": None,
                    "note": note,
                })

        all_records.extend(records)
        total_qty = sum(r["quantity"] for r in records)
        print(f"    레코드: {len(records)}건, 총 수량: {total_qty}")

    print(f"\n  인서 총 레코드: {len(all_records)}건")
    return all_records


# =============================================================================
# 호남 판매내역 파싱
# =============================================================================

def parse_sales(dry_run=False):
    """호남 판매내역 파싱"""
    print(f"\n{'='*60}")
    print(f"호남 판매내역 파싱: {SALES_FILE}")
    print(f"{'='*60}")

    if not os.path.exists(SALES_FILE):
        print(f"[오류] 파일 없음: {SALES_FILE}")
        return []

    df = pd.read_excel(SALES_FILE, sheet_name="Sheet1", header=None)

    if df.shape[0] < 2:
        print("  데이터 부족")
        return []

    # Row 0: 헤더
    # 사이즈 컬럼 매핑 (col 13~29)
    header_row = df.iloc[0]
    size_map = detect_size_columns(header_row)

    records = []
    current_date = None
    current_brand = None

    for i in range(1, len(df)):
        row = df.iloc[i]

        # 날짜 업데이트
        if pd.notna(row.iloc[0]):
            try:
                if isinstance(row.iloc[0], (datetime, date)):
                    current_date = row.iloc[0].date() if isinstance(row.iloc[0], datetime) else row.iloc[0]
                else:
                    current_date = pd.to_datetime(row.iloc[0]).date()
            except Exception:
                pass

        # 브랜드 업데이트
        if pd.notna(row.iloc[3]):
            current_brand = str(row.iloc[3]).strip()

        # 품번 확인
        code_raw = row.iloc[5] if len(row) > 5 else None
        if pd.isna(code_raw):
            continue

        code_str = str(code_raw).strip()
        if not code_str or not re.match(r'^[A-Za-z0-9]', code_str):
            continue

        product_code = code_str.upper()

        # 아디다스 품번만 처리 (XX0000 형태: 영문2자리 + 숫자4자리)
        if not re.match(r'^[A-Z]{2}\d{4}$', product_code):
            continue

        total_qty = safe_int(row.iloc[12]) if len(row) > 12 else 0
        unit_price = safe_price(row.iloc[8]) if len(row) > 8 else None
        total_price = safe_price(row.iloc[9]) if len(row) > 9 else None

        if total_qty <= 0:
            continue

        source = current_brand or "미분류"

        # 사이즈별 레코드
        has_sizes = False
        for col_idx, size in size_map.items():
            if col_idx < len(row):
                qty = safe_int(row.iloc[col_idx])
                if qty > 0:
                    has_sizes = True
                    records.append({
                        "product_code": product_code,
                        "size": size,
                        "quantity": qty,
                        "unit_price": unit_price,
                        "total_price": None,
                        "source": source,
                        "sale_date": current_date,
                        "note": None,
                    })

        # 사이즈 없으면 합계만
        if not has_sizes:
            records.append({
                "product_code": product_code,
                "size": None,
                "quantity": total_qty,
                "unit_price": unit_price,
                "total_price": total_price,
                "source": source,
                "sale_date": current_date,
                "note": None,
            })

    total_qty = sum(r["quantity"] for r in records)
    print(f"  레코드: {len(records)}건, 총 수량: {total_qty}")
    return records


# =============================================================================
# DB 삽입
# =============================================================================

def insert_purchases(session, records, dry_run=False):
    """구매 레코드 DB 삽입"""
    if dry_run:
        print(f"\n  [dry-run] 구매 {len(records)}건 삽입 예정")

        # 파일(buyer_name) + 시트(source)별 상세 출력
        from collections import defaultdict
        by_source = defaultdict(lambda: defaultdict(int))
        for r in records:
            key = f"[{r['buyer_name']}] {r['source']}"
            by_source[key][r["product_code"]] += r["quantity"]

        for source_key in sorted(by_source.keys()):
            codes = by_source[source_key]
            total = sum(codes.values())
            print(f"\n  --- {source_key} (품번 {len(codes)}개, 수량 {total}) ---")
            for code in sorted(codes.keys()):
                print(f"    {code}: {codes[code]}")

        # 전체 합계
        code_totals = {}
        for r in records:
            code = r["product_code"]
            code_totals[code] = code_totals.get(code, 0) + r["quantity"]
        print(f"\n  === 전체 합계: 고유 품번 {len(code_totals)}개, 총 수량 {sum(code_totals.values())} ===")
        for code in sorted(code_totals.keys()):
            print(f"    {code}: {code_totals[code]}")
        return

    count = 0
    for r in records:
        session.execute(text("""
            INSERT INTO adidas_comparison_purchases
            (id, product_code, size, quantity, unit_price, buyer_name, source, category, note, created_at, updated_at)
            VALUES (:id, :product_code, :size, :quantity, :unit_price, :buyer_name, :source, :category, :note, NOW(), NOW())
        """), {
            "id": str(uuid.uuid4()),
            "product_code": r["product_code"],
            "size": r["size"],
            "quantity": r["quantity"],
            "unit_price": r["unit_price"],
            "buyer_name": r["buyer_name"],
            "source": r["source"],
            "category": r.get("category"),
            "note": r.get("note"),
        })
        count += 1
        if count % 500 == 0:
            session.commit()
            print(f"    {count}건 삽입...")

    session.commit()
    print(f"  구매 {count}건 삽입 완료")


def insert_sales(session, records, dry_run=False):
    """판매 레코드 DB 삽입"""
    if dry_run:
        print(f"\n  [dry-run] 판매 {len(records)}건 삽입 예정")
        code_totals = {}
        for r in records:
            code = r["product_code"]
            code_totals[code] = code_totals.get(code, 0) + r["quantity"]
        print(f"  고유 품번: {len(code_totals)}개")
        for code in sorted(code_totals.keys())[:20]:
            print(f"    {code}: {code_totals[code]}")
        if len(code_totals) > 20:
            print(f"    ... 외 {len(code_totals) - 20}개")
        return

    count = 0
    for r in records:
        session.execute(text("""
            INSERT INTO adidas_comparison_sales
            (id, product_code, size, quantity, unit_price, total_price, source, sale_date, note, created_at, updated_at)
            VALUES (:id, :product_code, :size, :quantity, :unit_price, :total_price, :source, :sale_date, :note, NOW(), NOW())
        """), {
            "id": str(uuid.uuid4()),
            "product_code": r["product_code"],
            "size": r["size"],
            "quantity": r["quantity"],
            "unit_price": r.get("unit_price"),
            "total_price": r.get("total_price"),
            "source": r["source"],
            "sale_date": r.get("sale_date"),
            "note": r.get("note"),
        })
        count += 1

    session.commit()
    print(f"  판매 {count}건 삽입 완료")


def main():
    parser = argparse.ArgumentParser(description="아디다스 구매/판매 비교 데이터 이관")
    parser.add_argument("--dry-run", action="store_true", help="테스트 실행 (DB 반영 안함)")
    parser.add_argument("--clear", action="store_true", help="기존 데이터 삭제 후 실행")
    parser.add_argument("--purchases-only", action="store_true", help="구매내역만 처리")
    parser.add_argument("--sales-only", action="store_true", help="판매내역만 처리")
    args = parser.parse_args()

    print("=" * 60)
    print("아디다스 구매/판매 비교 데이터 이관 스크립트")
    print("=" * 60)
    print(f"모드: {'테스트 (dry-run)' if args.dry_run else '실제 실행'}")

    # 구매내역 파싱
    all_purchases = []
    if not args.sales_only:
        dahee_records = parse_dahee(args.dry_run)
        inser_records = parse_inser(args.dry_run)
        all_purchases = dahee_records + inser_records

        print(f"\n{'='*60}")
        print(f"구매내역 합계: {len(all_purchases)}건, 총 수량: {sum(r['quantity'] for r in all_purchases)}")

    # 판매내역 파싱
    sales_records = []
    if not args.purchases_only:
        sales_records = parse_sales(args.dry_run)

        print(f"\n{'='*60}")
        print(f"판매내역 합계: {len(sales_records)}건, 총 수량: {sum(r['quantity'] for r in sales_records)}")

    # dry-run이면 결과만 출력하고 종료
    if args.dry_run:
        insert_purchases(None, all_purchases, dry_run=True)
        insert_sales(None, sales_records, dry_run=True)
        print("\n[dry-run] DB 연결 없이 파싱 결과만 출력")
        print("=" * 60)
        return

    # 실제 실행: DB 연결
    print(f"\nDB: {DATABASE_URL.split('@')[1] if '@' in DATABASE_URL else DATABASE_URL}")
    engine = create_engine(DATABASE_URL)
    Session = sessionmaker(bind=engine)
    session = Session()

    try:
        # 테이블 생성 (없으면)
        session.execute(text("""
            CREATE TABLE IF NOT EXISTS adidas_comparison_purchases (
                id UUID PRIMARY KEY,
                product_code VARCHAR(100) NOT NULL,
                size VARCHAR(20),
                quantity INTEGER DEFAULT 0,
                unit_price INTEGER,
                buyer_name VARCHAR(50) NOT NULL,
                source VARCHAR(100) NOT NULL,
                category VARCHAR(20),
                note VARCHAR(200),
                created_at TIMESTAMP NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMP NOT NULL DEFAULT NOW()
            )
        """))
        session.execute(text("""
            CREATE TABLE IF NOT EXISTS adidas_comparison_sales (
                id UUID PRIMARY KEY,
                product_code VARCHAR(100) NOT NULL,
                size VARCHAR(20),
                quantity INTEGER DEFAULT 0,
                unit_price INTEGER,
                total_price INTEGER,
                source VARCHAR(100) NOT NULL,
                sale_date DATE,
                note VARCHAR(200),
                created_at TIMESTAMP NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMP NOT NULL DEFAULT NOW()
            )
        """))
        session.execute(text(
            "CREATE INDEX IF NOT EXISTS idx_acp_product_code ON adidas_comparison_purchases(product_code)"
        ))
        session.execute(text(
            "CREATE INDEX IF NOT EXISTS idx_acs_product_code ON adidas_comparison_sales(product_code)"
        ))
        session.commit()

        # 기존 데이터 삭제
        if args.clear:
            if not args.sales_only:
                count = session.execute(text("DELETE FROM adidas_comparison_purchases")).rowcount
                print(f"\n기존 구매 데이터 {count}건 삭제")
            if not args.purchases_only:
                count = session.execute(text("DELETE FROM adidas_comparison_sales")).rowcount
                print(f"기존 판매 데이터 {count}건 삭제")
            session.commit()

        # DB 삽입
        if all_purchases:
            insert_purchases(session, all_purchases, dry_run=False)
        if sales_records:
            insert_sales(session, sales_records, dry_run=False)

        session.commit()
        print("\n완료!")

    except Exception as e:
        print(f"\n[오류] {e}")
        import traceback
        traceback.print_exc()
        session.rollback()
        raise
    finally:
        session.close()

    print("=" * 60)


if __name__ == "__main__":
    main()
