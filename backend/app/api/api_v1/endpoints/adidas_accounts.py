"""
아디다스 계정 관리 API
"""
from typing import List
from uuid import UUID
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, Body
from sqlalchemy.orm import Session

from app.api import deps
from app.models.user import User
from app.models.adidas_account import AdidasAccount
from app.schemas.adidas_account import (
    AdidasAccountCreate,
    AdidasAccountUpdate,
    AdidasAccountInDB,
    AdidasAccountInfo,
    CouponStatus,
    SaveCookiesRequest,
    IssueCouponRequest,
)
from app.services.adidas_mobile_automation import AdidasMobileAutomation

router = APIRouter()


@router.get("/", response_model=List[AdidasAccountInDB])
def get_adidas_accounts(
    skip: int = 0,
    limit: int = 10000,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user),
):
    """아디다스 계정 목록 조회 (최신 순)"""
    accounts = db.query(AdidasAccount).order_by(AdidasAccount.created_at.desc()).offset(skip).limit(limit).all()
    return accounts


@router.post("/", response_model=AdidasAccountInDB)
def create_adidas_account(
    account_in: AdidasAccountCreate,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user),
):
    """아디다스 계정 추가"""
    # 이메일 중복 체크
    existing = db.query(AdidasAccount).filter(
        AdidasAccount.email == account_in.email
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="이미 등록된 이메일입니다")

    account = AdidasAccount(**account_in.dict())
    db.add(account)
    db.commit()
    db.refresh(account)
    return account


@router.post("/bulk", response_model=dict)
def create_bulk_adidas_accounts(
    accounts_in: List[AdidasAccountCreate],
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user),
):
    """아디다스 계정 일괄 추가"""
    created = 0
    skipped = 0
    errors = []

    # 입력 데이터에서 중복 이메일 제거 (첫 번째 것만 유지)
    seen_emails = set()
    unique_accounts = []
    for account_in in accounts_in:
        if account_in.email not in seen_emails:
            seen_emails.add(account_in.email)
            unique_accounts.append(account_in)
        else:
            skipped += 1

    # 기존 DB의 이메일 목록 조회
    existing_emails = {
        email[0] for email in db.query(AdidasAccount.email).all()
    }

    # 새로운 계정만 추가
    for account_in in unique_accounts:
        try:
            if account_in.email in existing_emails:
                skipped += 1
                continue

            account = AdidasAccount(**account_in.dict())
            db.add(account)
            created += 1
        except Exception as e:
            errors.append(f"{account_in.email}: {str(e)}")

    try:
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"일괄 등록 실패: {str(e)}")

    return {
        "created": created,
        "skipped": skipped,
        "errors": errors,
        "total": len(accounts_in),
    }


@router.post("/bulk-upsert", response_model=dict)
def bulk_upsert_adidas_accounts(
    accounts_in: List[dict],
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user),
):
    """아디다스 계정 일괄 등록/수정 (Upsert)

    - is_existing: True인 경우 기존 계정 업데이트
    - is_existing: False인 경우 새 계정 생성 (중복 시 스킵)
    """
    created = 0
    updated = 0
    skipped = 0
    errors = []

    # 입력 데이터에서 중복 이메일 제거 (마지막 것 유지 - 수정 우선)
    email_to_account = {}
    for account_data in accounts_in:
        email = account_data.get("email")
        if email:
            email_to_account[email] = account_data

    unique_accounts = list(email_to_account.values())

    # 기존 DB의 계정 조회 (이메일 기준)
    existing_accounts = {
        acc.email: acc for acc in db.query(AdidasAccount).all()
    }

    for account_data in unique_accounts:
        try:
            email = account_data.get("email")
            is_existing = account_data.get("is_existing", False)

            if email in existing_accounts:
                if is_existing:
                    # 기존 계정 업데이트
                    existing = existing_accounts[email]
                    update_fields = ["password", "name", "phone", "birthday"]
                    for field in update_fields:
                        value = account_data.get(field)
                        if value:
                            setattr(existing, field, value)
                    existing.updated_at = datetime.utcnow()
                    updated += 1
                else:
                    # 신규로 표시되었지만 이미 존재 -> 스킵
                    skipped += 1
            else:
                # 새 계정 생성
                new_account = AdidasAccount(
                    email=email,
                    password=account_data.get("password", ""),
                    name=account_data.get("name"),
                    phone=account_data.get("phone"),
                    birthday=account_data.get("birthday"),
                    is_active=account_data.get("is_active", True),
                )
                db.add(new_account)
                created += 1

        except Exception as e:
            errors.append(f"{account_data.get('email', 'unknown')}: {str(e)}")

    try:
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"일괄 등록/수정 실패: {str(e)}")

    return {
        "created": created,
        "updated": updated,
        "skipped": skipped,
        "errors": errors,
        "total": len(accounts_in),
    }


@router.get("/{account_id}", response_model=AdidasAccountInDB)
def get_adidas_account(
    account_id: UUID,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user),
):
    """아디다스 계정 상세 조회"""
    account = db.query(AdidasAccount).filter(AdidasAccount.id == account_id).first()
    if not account:
        raise HTTPException(status_code=404, detail="계정을 찾을 수 없습니다")
    return account


@router.put("/{account_id}", response_model=AdidasAccountInDB)
def update_adidas_account(
    account_id: UUID,
    account_in: AdidasAccountUpdate,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user),
):
    """아디다스 계정 수정"""
    account = db.query(AdidasAccount).filter(AdidasAccount.id == account_id).first()
    if not account:
        raise HTTPException(status_code=404, detail="계정을 찾을 수 없습니다")

    update_data = account_in.dict(exclude_unset=True)
    for field, value in update_data.items():
        setattr(account, field, value)

    db.commit()
    db.refresh(account)
    return account


@router.delete("/{account_id}")
def delete_adidas_account(
    account_id: UUID,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user),
):
    """아디다스 계정 삭제"""
    account = db.query(AdidasAccount).filter(AdidasAccount.id == account_id).first()
    if not account:
        raise HTTPException(status_code=404, detail="계정을 찾을 수 없습니다")

    db.delete(account)
    db.commit()
    return {"message": "계정이 삭제되었습니다"}


@router.post("/{account_id}/voucher-sale")
def update_voucher_sale(
    account_id: UUID,
    request_data: dict = Body(...),
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user),
):
    """쿠폰 판매 상태 업데이트

    request_data:
    - voucher_index: 쿠폰 인덱스 (0부터 시작)
    - sold: 판매 여부 (true/false)
    - sold_to: 판매 정보 (예: "12/16 백호") - 선택사항
    """
    import json

    account = db.query(AdidasAccount).filter(AdidasAccount.id == account_id).first()
    if not account:
        raise HTTPException(status_code=404, detail="계정을 찾을 수 없습니다")

    voucher_index = request_data.get("voucher_index")
    sold = request_data.get("sold", False)
    sold_to = request_data.get("sold_to", "")

    if voucher_index is None:
        raise HTTPException(status_code=400, detail="쿠폰 인덱스가 필요합니다")

    # 기존 쿠폰 목록 파싱
    try:
        vouchers = json.loads(account.owned_vouchers) if account.owned_vouchers else []
    except json.JSONDecodeError:
        vouchers = []

    if voucher_index < 0 or voucher_index >= len(vouchers):
        raise HTTPException(status_code=400, detail="유효하지 않은 쿠폰 인덱스입니다")

    # 쿠폰 판매 정보 업데이트
    vouchers[voucher_index]["sold"] = sold
    vouchers[voucher_index]["sold_to"] = sold_to if sold else ""

    # DB 업데이트
    account.owned_vouchers = json.dumps(vouchers, ensure_ascii=False)
    account.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(account)

    return {
        "success": True,
        "message": "쿠폰 판매 상태가 업데이트되었습니다",
        "vouchers": vouchers,
    }


@router.post("/bulk-toggle-active")
def bulk_toggle_active(
    request_data: dict,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user),
):
    """선택한 계정 일괄 활성화/비활성화"""
    account_ids = [UUID(aid) for aid in request_data.get("account_ids", [])]
    is_active = request_data.get("is_active", True)

    if not account_ids:
        raise HTTPException(status_code=400, detail="계정을 선택하세요")

    accounts = db.query(AdidasAccount).filter(
        AdidasAccount.id.in_(account_ids)
    ).all()

    if not accounts:
        raise HTTPException(status_code=404, detail="계정을 찾을 수 없습니다")

    for account in accounts:
        account.is_active = is_active

    db.commit()

    action = "활성화" if is_active else "비활성화"
    return {
        "success": True,
        "message": f"{len(accounts)}개 계정이 {action}되었습니다",
        "count": len(accounts)
    }


# 웹 스크래핑 방식은 Akamai 보안으로 인해 불가능하여 제거됨
# TODO: Appium을 사용한 안드로이드 자동화로 대체 예정


@router.post("/{account_id}/save-cookies")
async def save_cookies(
    account_id: UUID,
    request: SaveCookiesRequest,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user),
):
    """
    세션 쿠키 저장 (수동 로그인 후)

    사용법:
    1. Chrome 개발자 도구 열기 (F12)
    2. Application 탭 → Cookies → https://www.adidas.co.kr
    3. 모든 쿠키를 JSON 형식으로 복사
    4. 이 API로 전송
    """
    account = db.query(AdidasAccount).filter(AdidasAccount.id == account_id).first()
    if not account:
        raise HTTPException(status_code=404, detail="계정을 찾을 수 없습니다")

    # 쿠키 저장
    account.session_cookies = request.cookies
    db.commit()
    db.refresh(account)

    return {
        "message": "세션 쿠키가 저장되었습니다",
        "account_id": str(account_id),
        "email": account.email,
    }


@router.post("/{account_id}/check-coupons", response_model=CouponStatus)
async def check_coupons(
    account_id: UUID,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user),
):
    """
    아디다스 계정의 쿠폰 보유 현황 조회 (저장된 쿠키 사용)
    """
    import json
    import httpx
    from datetime import datetime

    account = db.query(AdidasAccount).filter(AdidasAccount.id == account_id).first()
    if not account:
        raise HTTPException(status_code=404, detail="계정을 찾을 수 없습니다")

    if not account.session_cookies:
        raise HTTPException(status_code=400, detail="저장된 세션 쿠키가 없습니다. 먼저 수동 로그인 후 쿠키를 저장해주세요.")

    try:
        # 저장된 쿠키 파싱
        cookies_dict = json.loads(account.session_cookies)

        # httpx로 쿠폰 조회 API 호출
        async with httpx.AsyncClient() as client:
            headers = {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                "Accept": "application/json",
                "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
            }

            # 쿠폰 API URL (실제 아디다스 쿠폰 API 엔드포인트)
            coupon_url = "https://www.adidas.co.kr/api/account/coupons"

            response = await client.get(
                coupon_url,
                headers=headers,
                cookies=cookies_dict,
            )

            if response.status_code == 200:
                data = response.json()
                # 쿠폰 데이터 파싱 (실제 응답 구조에 맞게 수정 필요)
                account.last_coupon_check = datetime.utcnow()
                db.commit()

                return CouponStatus(
                    account_id=account.id,
                    email=account.email,
                    discount_15=0,  # data에서 파싱
                    discount_20=0,  # data에서 파싱
                    amount_100k=0,  # data에서 파싱
                    amount_50k=0,   # data에서 파싱
                    total_coupons=len(data.get('coupons', [])),
                    last_checked=account.last_coupon_check,
                )
            else:
                raise HTTPException(
                    status_code=response.status_code,
                    detail=f"쿠폰 조회 실패: {response.text}"
                )

    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="쿠키 형식이 올바르지 않습니다")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"쿠폰 조회 실패: {str(e)}")


@router.post("/{account_id}/mobile-login")
async def mobile_login(
    account_id: UUID,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user),
):
    """
    모바일 웹 자동화로 로그인 및 쿠키 추출
    """
    account = db.query(AdidasAccount).filter(AdidasAccount.id == account_id).first()
    if not account:
        raise HTTPException(status_code=404, detail="계정을 찾을 수 없습니다")

    if not account.password:
        raise HTTPException(status_code=400, detail="비밀번호가 설정되지 않았습니다")

    try:
        async with AdidasMobileAutomation(headless=True) as automation:
            # 로그인 시도
            result = await automation.login(account.email, account.password)

            if result.get("success"):
                # 쿠키 저장
                cookies = result.get("cookies", [])
                if cookies:
                    import json
                    account.cookies = json.dumps(cookies)
                    db.commit()

                return {
                    "success": True,
                    "message": "로그인 성공 및 쿠키 저장 완료",
                    "url": result.get("url"),
                    "cookies_count": len(cookies),
                }
            else:
                return {
                    "success": False,
                    "error": result.get("error", "로그인 실패"),
                }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"모바일 자동화 실패: {str(e)}")


@router.post("/{account_id}/mobile-get-info")
async def mobile_get_user_info(
    account_id: UUID,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user),
):
    """
    모바일 웹 자동화로 사용자 정보 조회
    """
    account = db.query(AdidasAccount).filter(AdidasAccount.id == account_id).first()
    if not account:
        raise HTTPException(status_code=404, detail="계정을 찾을 수 없습니다")

    if not account.password:
        raise HTTPException(status_code=400, detail="비밀번호가 설정되지 않았습니다")

    try:
        async with AdidasMobileAutomation(headless=True) as automation:
            # 먼저 로그인
            login_result = await automation.login(account.email, account.password)

            if not login_result.get("success"):
                raise HTTPException(
                    status_code=401,
                    detail=f"로그인 실패: {login_result.get('error')}"
                )

            # 사용자 정보 조회
            info_result = await automation.get_user_info()

            if info_result.get("success"):
                user_data = info_result.get("data", {})

                # DB 업데이트
                if user_data.get("name"):
                    account.name = user_data["name"]
                if user_data.get("phone"):
                    account.phone = user_data["phone"]
                if user_data.get("birthday"):
                    account.birthday = user_data["birthday"]

                db.commit()

                return {
                    "success": True,
                    "data": user_data,
                }
            else:
                return {
                    "success": False,
                    "error": info_result.get("error", "정보 조회 실패"),
                }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"모바일 자동화 실패: {str(e)}")


@router.post("/{account_id}/mobile-get-coupons")
async def mobile_get_coupons(
    account_id: UUID,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user),
):
    """
    모바일 웹 자동화로 쿠폰 조회
    """
    account = db.query(AdidasAccount).filter(AdidasAccount.id == account_id).first()
    if not account:
        raise HTTPException(status_code=404, detail="계정을 찾을 수 없습니다")

    if not account.password:
        raise HTTPException(status_code=400, detail="비밀번호가 설정되지 않았습니다")

    try:
        async with AdidasMobileAutomation(headless=True) as automation:
            # 먼저 로그인
            login_result = await automation.login(account.email, account.password)

            if not login_result.get("success"):
                raise HTTPException(
                    status_code=401,
                    detail=f"로그인 실패: {login_result.get('error')}"
                )

            # 쿠폰 조회
            coupon_result = await automation.get_coupons()

            if coupon_result.get("success"):
                from datetime import datetime
                account.last_coupon_check = datetime.utcnow()
                db.commit()

                return {
                    "success": True,
                    "count": coupon_result.get("count", 0),
                    "coupons": coupon_result.get("coupons", []),
                }
            else:
                return {
                    "success": False,
                    "error": coupon_result.get("error", "쿠폰 조회 실패"),
                }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"모바일 자동화 실패: {str(e)}")


@router.post("/{account_id}/generate-barcode")
async def generate_barcode(
    account_id: UUID,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user),
):
    """
    ADIKR 바코드 이미지 생성
    """
    import os
    import barcode
    from barcode.writer import ImageWriter
    from pathlib import Path

    account = db.query(AdidasAccount).filter(AdidasAccount.id == account_id).first()
    if not account:
        raise HTTPException(status_code=404, detail="계정을 찾을 수 없습니다")

    if not account.adikr_barcode:
        raise HTTPException(status_code=400, detail="ADIKR 바코드가 없습니다")

    try:
        # 바코드 저장 디렉토리 생성
        barcode_dir = Path("/app/uploads/barcodes")
        barcode_dir.mkdir(parents=True, exist_ok=True)

        # 바코드 이미지 생성 (Code128 형식)
        code128 = barcode.get_barcode_class('code128')
        barcode_instance = code128(account.adikr_barcode, writer=ImageWriter())

        # 파일명: {account_id}.png
        filename = f"{account_id}"
        filepath = barcode_dir / filename

        # 바코드 이미지 저장 (옵션: 텍스트 표시, 여백 최소화)
        barcode_instance.save(
            str(filepath),
            options={
                'module_width': 0.3,
                'module_height': 10.0,
                'font_size': 10,
                'text_distance': 3,
                'quiet_zone': 2,
            }
        )

        # DB 업데이트
        barcode_url = f"/uploads/barcodes/{filename}.png"
        account.barcode_image_url = barcode_url
        db.commit()

        return {
            "success": True,
            "barcode_url": barcode_url,
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"바코드 생성 실패: {str(e)}")


@router.post("/{account_id}/fetch-info")
async def fetch_account_info(
    account_id: UUID,
    background_tasks: BackgroundTasks,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user),
):
    """
    Android 앱 자동화로 계정 정보 추출 (이름, ADIKR, 포인트, 쿠폰)
    """
    import os
    from appium import webdriver
    from appium.options.android import UiAutomator2Options

    account = db.query(AdidasAccount).filter(AdidasAccount.id == account_id).first()
    if not account:
        raise HTTPException(status_code=404, detail="계정을 찾을 수 없습니다")

    if not account.password:
        raise HTTPException(status_code=400, detail="비밀번호가 설정되지 않았습니다")

    # Appium 연결 체크
    appium_url = os.getenv("APPIUM_URL", "http://host.docker.internal:4723")
    try:
        options = UiAutomator2Options()
        options.platform_name = "Android"
        options.device_name = "emulator-5554"
        test_driver = webdriver.Remote(appium_url, options=options)
        test_driver.quit()
    except Exception as e:
        error_msg = str(e).lower()
        if 'connection' in error_msg or 'refused' in error_msg or 'timeout' in error_msg or 'max retries' in error_msg:
            raise HTTPException(status_code=503, detail="모바일 기기 연결이 되지 않았습니다")
        else:
            raise HTTPException(status_code=500, detail=f"Appium 연결 오류: {str(e)[:100]}")

    # 백그라운드 태스크로 실행
    background_tasks.add_task(
        _extract_account_info_task,
        str(account_id),
        account.email,
        account.password,
    )

    return {
        "success": True,
        "message": "정보 추출 작업이 시작되었습니다. 잠시 후 새로고침하세요.",
    }


@router.post("/bulk-fetch-info")
async def bulk_fetch_info(
    request_data: dict,
    background_tasks: BackgroundTasks,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user),
):
    """
    여러 계정 일괄 정보 추출 (순차 처리)
    """
    account_ids = [UUID(aid) for aid in request_data.get("account_ids", [])]

    accounts = db.query(AdidasAccount).filter(
        AdidasAccount.id.in_(account_ids)
    ).all()

    if not accounts:
        raise HTTPException(status_code=404, detail="계정을 찾을 수 없습니다")

    # 활성화된 계정만 필터링
    account_list = [
        {"id": str(acc.id), "email": acc.email, "password": acc.password}
        for acc in accounts if acc.password and acc.is_active
    ]

    if not account_list:
        raise HTTPException(status_code=400, detail="활성화된 계정이 없습니다")

    background_tasks.add_task(_bulk_extract_accounts_task, account_list)

    return {
        "success": True,
        "message": f"{len(account_list)}개 계정 정보 추출 작업이 시작되었습니다. 순차적으로 처리됩니다.",
    }


def _bulk_extract_accounts_task(account_list: list):
    """
    백그라운드 태스크: 여러 계정을 순차적으로 처리 (단일 Appium 세션 재사용)
    """
    from app.services.adidas_bulk_info_extraction import extract_bulk_account_info
    from app.db.database import SessionLocal
    from datetime import timezone, timedelta
    import os
    import json

    print(f"[일괄 정보조회] 총 {len(account_list)}개 계정 순차 처리 시작")

    appium_url = os.getenv("APPIUM_URL", "http://127.0.0.1:4723")
    kst = timezone(timedelta(hours=9))

    # 각 계정 처리 완료 시 즉시 DB 업데이트하는 콜백 함수
    def update_db_callback(account_id, email, result, idx, total):
        """각 계정 처리 완료 시 즉시 DB 업데이트"""
        from uuid import UUID as UUIDType
        from datetime import datetime

        print(f"\n[일괄 정보조회] {idx}/{total} - {email} DB 업데이트 시작")

        db = SessionLocal()
        try:
            account = db.query(AdidasAccount).filter(
                AdidasAccount.id == UUIDType(account_id)
            ).first()

            if not account:
                print(f"[일괄 정보조회] {idx}/{total} - 계정을 찾을 수 없음: {account_id}")
                return

            # 기존 쿠폰 발급 현황 유지
            existing_coupon_lines = []
            if account.fetch_status:
                lines = account.fetch_status.split('\n')
                for line in lines[1:]:  # 첫 줄 제외
                    if '쿠폰:' in line:
                        existing_coupon_lines.append(line)

            if result.get("success") and result.get("data"):
                # 성공 시
                data = result["data"]

                # 사용자 정보 업데이트
                if "name" in data:
                    account.name = data["name"]
                if "phone" in data:
                    account.phone = data["phone"]
                if "birthday" in data:
                    account.birthday = data["birthday"]
                if "adikr_barcode" in data:
                    account.adikr_barcode = data["adikr_barcode"]
                if "current_points" in data:
                    account.current_points = data["current_points"]

                # 보유 쿠폰 업데이트 (사라진 코드도 보존 - 오프라인 사용 후 온라인 재사용 가능)
                if "vouchers" in data:
                    new_vouchers = data["vouchers"]
                    existing_v = json.loads(account.owned_vouchers) if account.owned_vouchers else []
                    new_codes = {v.get("code") for v in new_vouchers if v.get("code") and v.get("code") != "N/A"}
                    historical = [v for v in existing_v if v.get("code") and v.get("code") != "N/A" and v.get("code") not in new_codes]
                    account.owned_vouchers = json.dumps(new_vouchers + historical, ensure_ascii=False)

                # 조회 시간 업데이트
                account.last_fetch = datetime.utcnow()

                # fetch_status 업데이트
                fetch_time = datetime.now(kst).strftime('%Y-%m-%d %H:%M')
                info_status = f"정보 조회 완료 ({fetch_time})"

                if existing_coupon_lines:
                    account.fetch_status = f"{info_status}\n" + "\n".join(existing_coupon_lines)
                else:
                    account.fetch_status = info_status

                print(f"[일괄 정보조회] {idx}/{total} - {email} 성공")

            else:
                # 실패 시
                error_message = result.get("message", "알 수 없는 오류")

                if existing_coupon_lines:
                    account.fetch_status = f"{error_message}\n" + "\n".join(existing_coupon_lines)
                else:
                    account.fetch_status = error_message

                print(f"[일괄 정보조회] {idx}/{total} - {email} 실패: {error_message}")

            db.commit()
            print(f"[일괄 정보조회] {idx}/{total} - {email} DB 업데이트 완료")

        except Exception as e:
            print(f"[일괄 정보조회] {idx}/{total} - {email} DB 업데이트 오류: {e}")
            import traceback
            traceback.print_exc()
        finally:
            db.close()

    # 단일 Appium 세션으로 모든 계정 처리
    try:
        extract_bulk_account_info(account_list, appium_url, on_each_complete=update_db_callback)
    except Exception as e:
        print(f"[일괄 정보조회] Appium 연결 실패: {e}")
        return

    print(f"\n[일괄 정보조회] 전체 {len(account_list)}개 계정 처리 완료")


def _extract_account_info_task(account_id: str, email: str, password: str):
    """
    백그라운드 태스크: 계정 정보 추출 (로그인 + 추출 분리 방식)
    """
    import json
    import os
    from datetime import datetime, timezone, timedelta
    from app.services.adidas_automation_login import login
    from app.services.adidas_automation_extract import extract_user_info_and_vouchers
    from app.db.database import SessionLocal
    from uuid import UUID as UUIDType
    from app.models.adidas_account import AdidasAccount

    db = SessionLocal()
    account = None  # 예외 처리에서도 사용할 수 있도록 미리 선언

    try:
        print(f"\n[Task] 계정 정보 추출 시작: {email}")

        # 상태 업데이트: 처리 중
        account = db.query(AdidasAccount).filter(
            AdidasAccount.id == UUIDType(account_id)
        ).first()

        if not account:
            print(f"[Task ERROR] 계정을 찾을 수 없음: {account_id}")
            return

        account.fetch_status = "정보 조회 중..."
        db.commit()

        appium_url = os.getenv("APPIUM_URL", "http://host.docker.internal:4723")
        print(f"[TASK] Appium URL: {appium_url}")

        # 1단계: 로그인
        print(f"[TASK] 1단계: 로그인 시작 - {email}")
        try:
            login_success = login(email, password, appium_url)
        except ConnectionError as e:
            # Appium 서버 연결 실패 - 이미 엔드포인트에서 체크했으므로 여기는 도달하지 않음
            print(f"[Task] Appium 연결 실패: {e}")
            return
        except Exception as e:
            print(f"[Task] 로그인 중 예외 발생: {e}")

            # 기존 쿠폰 발급 현황 유지
            existing_coupon_lines = []
            if account.fetch_status:
                lines = account.fetch_status.split('\n')
                for i in range(1, len(lines)):
                    if '쿠폰:' in lines[i]:
                        existing_coupon_lines.append(lines[i])

            info_status = f"로그인 오류: {str(e)[:50]}"
            if existing_coupon_lines:
                account.fetch_status = f"{info_status}\n" + "\n".join(existing_coupon_lines)
            else:
                account.fetch_status = info_status

            db.commit()
            return

        if not login_success:
            print(f"[Task] 로그인 실패: {email}")

            # 기존 쿠폰 발급 현황 유지
            existing_coupon_lines = []
            if account.fetch_status:
                print(f"[DEBUG] 로그인실패 - 현재 fetch_status: {account.fetch_status}")
                lines = account.fetch_status.split('\n')
                for i in range(1, len(lines)):
                    if '쿠폰:' in lines[i]:
                        existing_coupon_lines.append(lines[i])
                print(f"[DEBUG] 로그인실패 - 쿠폰 라인 수: {len(existing_coupon_lines)}")

            info_status = "로그인 실패 (계정 정보 확인 필요)"
            if existing_coupon_lines:
                account.fetch_status = f"{info_status}\n" + "\n".join(existing_coupon_lines)
            else:
                account.fetch_status = info_status

            print(f"[DEBUG] 로그인실패 - 최종 fetch_status: {account.fetch_status}")

            db.commit()
            return

        print(f"[TASK] 1단계 완료: 로그인 성공")

        # 2단계: 정보 추출
        print(f"[TASK] 2단계: 정보 추출 시작 - {email}")
        try:
            result = extract_user_info_and_vouchers(email, password, appium_url, debug=False)
        except Exception as e:
            print(f"[Task] 정보 추출 중 예외 발생: {e}")

            # 기존 쿠폰 발급 현황 유지
            existing_coupon_lines = []
            if account.fetch_status:
                lines = account.fetch_status.split('\n')
                for i in range(1, len(lines)):
                    if '쿠폰:' in lines[i]:
                        existing_coupon_lines.append(lines[i])

            info_status = f"추출 오류: {str(e)[:50]}"
            if existing_coupon_lines:
                account.fetch_status = f"{info_status}\n" + "\n".join(existing_coupon_lines)
            else:
                account.fetch_status = info_status

            db.commit()
            return

        if not result:
            print(f"[Task] 정보 추출 실패: {email}")

            # 기존 쿠폰 발급 현황 유지
            existing_coupon_lines = []
            if account.fetch_status:
                print(f"[DEBUG] 정보추출실패 - 현재 fetch_status: {account.fetch_status}")
                lines = account.fetch_status.split('\n')
                for i in range(1, len(lines)):
                    if '쿠폰:' in lines[i]:
                        existing_coupon_lines.append(lines[i])
                print(f"[DEBUG] 정보추출실패 - 쿠폰 라인 수: {len(existing_coupon_lines)}")

            info_status = "정보 추출 실패"
            if existing_coupon_lines:
                account.fetch_status = f"{info_status}\n" + "\n".join(existing_coupon_lines)
            else:
                account.fetch_status = info_status

            print(f"[DEBUG] 정보추출실패 - 최종 fetch_status: {account.fetch_status}")

            db.commit()
            return

        print(f"[TASK] 2단계 완료: 정보 추출 성공 - {result}")

        # DB 업데이트
        if result.get("name"):
            account.name = result.get("name")
        if result.get("birthday"):
            account.birthday = result.get("birthday")
        if result.get("phone"):
            account.phone = result.get("phone")
        if result.get("adikr_barcode"):
            account.adikr_barcode = result.get("adikr_barcode")
        if result.get("points") is not None:
            account.current_points = result.get("points")

        # 쿠폰 정보 저장 - 앱에서 추출한 쿠폰과 수동 발급한 쿠폰 병합
        extracted_vouchers_json = result.get("owned_vouchers")

        try:
            # 앱에서 추출한 쿠폰 목록
            extracted_vouchers = json.loads(extracted_vouchers_json) if extracted_vouchers_json else []

            # 기존 DB의 쿠폰 목록
            existing_vouchers = json.loads(account.owned_vouchers) if account.owned_vouchers else []

            # 새 목록에 없는 기존 쿠폰 보존:
            # (1) 코드가 있는데 API 결과에 없는 것 → 오프라인 사용으로 제거됐어도 코드 유지
            # (2) 수동 발급 쿠폰 (type == "discount_voucher")
            new_codes = {v.get("code") for v in extracted_vouchers if v.get("code") and v.get("code") != "N/A"}
            kept_from_existing = [
                v for v in existing_vouchers
                if (v.get("code") and v.get("code") != "N/A" and v.get("code") not in new_codes)
                or v.get("type") == "discount_voucher"
            ]

            # 앱에서 추출한 쿠폰 + 보존된 기존 쿠폰
            all_vouchers = extracted_vouchers + kept_from_existing

            account.owned_vouchers = json.dumps(all_vouchers, ensure_ascii=False)
        except Exception as e:
            print(f"[쿠폰 병합 오류] {e}, 추출한 쿠폰만 저장")
            account.owned_vouchers = extracted_vouchers_json

        account.last_login = datetime.utcnow()
        # 조회 완료 시간을 KST로 표시
        kst = timezone(timedelta(hours=9))
        completed_time = datetime.now(kst).strftime('%Y-%m-%d %H:%M')

        # 기존 쿠폰 발급 현황 유지 (두 번째 줄 이후 모든 쿠폰 관련 줄)
        existing_coupon_lines = []
        if account.fetch_status:
            print(f"[DEBUG] 정보조회 성공 - 현재 fetch_status: {account.fetch_status}")
            lines = account.fetch_status.split('\n')
            # 두 번째 줄부터 쿠폰 관련 내용 모두 유지
            for i in range(1, len(lines)):
                if '쿠폰:' in lines[i]:
                    existing_coupon_lines.append(lines[i])
            print(f"[DEBUG] 정보조회 성공 - 추출된 쿠폰 라인 수: {len(existing_coupon_lines)}")
            print(f"[DEBUG] 정보조회 성공 - 쿠폰 라인들: {existing_coupon_lines}")

        # 정보조회 현황 업데이트
        info_status = f"조회 완료 ({completed_time})"
        if existing_coupon_lines:
            account.fetch_status = f"{info_status}\n" + "\n".join(existing_coupon_lines)
        else:
            account.fetch_status = info_status

        print(f"[DEBUG] 정보조회 성공 - 최종 fetch_status: {account.fetch_status}")

        db.commit()
        print(f"[Task] DB 업데이트 완료: {email}")
        print(f"  - 이름: {account.name}")
        print(f"  - 포인트: {account.current_points}")
        print(f"  - ADIKR: {account.adikr_barcode}")
        print(f"[Task] 완료: {email}")

    except Exception as e:
        print(f"[Task ERROR] {email}: {e}")
        import traceback
        traceback.print_exc()
        # 오류 발생 시에도 DB에 상태 기록
        try:
            if account:
                # 기존 쿠폰 발급 현황 유지
                existing_coupon_lines = []
                if account.fetch_status:
                    lines = account.fetch_status.split('\n')
                    for i in range(1, len(lines)):
                        if '쿠폰:' in lines[i]:
                            existing_coupon_lines.append(lines[i])

                info_status = f"오류 발생: {str(e)[:100]}"
                if existing_coupon_lines:
                    account.fetch_status = f"{info_status}\n" + "\n".join(existing_coupon_lines)
                else:
                    account.fetch_status = info_status

                db.commit()
        except Exception as commit_error:
            print(f"[Task ERROR] DB 업데이트 실패: {commit_error}")
    finally:
        db.close()


def issue_coupon_task(account_id: str, email: str, password: str, coupon_amount: str):
    """백그라운드 쿠폰 발급 작업"""
    from app.db.database import SessionLocal
    from app.services.adidas_coupon_issuance_mobile import issue_coupon_mobile
    import os

    db = SessionLocal()
    try:
        print(f"[쿠폰발급 Task] 시작: {email}, {coupon_amount}원")

        appium_url = os.getenv("APPIUM_URL", "http://127.0.0.1:4723")

        try:
            result = issue_coupon_mobile(email, password, coupon_amount, appium_url)
        except ConnectionError as e:
            # Appium 서버 연결 실패 - 이미 엔드포인트에서 체크했으므로 여기는 도달하지 않음
            print(f"[쿠폰발급 Task] Appium 연결 실패: {e}")
            return

        # 결과 DB 업데이트
        account = db.query(AdidasAccount).filter(AdidasAccount.id == account_id).first()
        if account:
            from datetime import timezone, timedelta
            import json
            kst = timezone(timedelta(hours=9))

            # 기존 fetch_status 파싱 (정보조회 현황 유지)
            existing_info_status = ""
            if account.fetch_status:
                # 기존 상태에서 첫 번째 줄만 가져오기 (정보조회 현황)
                lines = account.fetch_status.split('\n')
                if lines:
                    existing_info_status = lines[0]

            if result.get("success"):
                # 성공 시
                issued_time = datetime.now(kst)
                account.last_coupon_check = datetime.utcnow()
                account.last_coupon_issued = datetime.utcnow()

                # 포인트 6000 차감 (10만원 쿠폰 발급 비용)
                if result.get("deduct_points") and account.current_points is not None:
                    old_points = account.current_points
                    account.current_points = max(0, account.current_points - 6000)
                    print(f"[쿠폰발급] 포인트 차감: {old_points:,} P → {account.current_points:,} P (-6,000)")

                # 기존 정보조회 현황 + 쿠폰 발급 현황
                coupon_status = f"쿠폰: 발급 완료 ({issued_time.strftime('%Y-%m-%d %H:%M')})"
                if existing_info_status:
                    account.fetch_status = f"{existing_info_status}\n{coupon_status}"
                else:
                    account.fetch_status = coupon_status

                # 보유 쿠폰 목록에 추가
                try:
                    if account.owned_vouchers:
                        vouchers = json.loads(account.owned_vouchers)
                    else:
                        vouchers = []

                    # 10만원 쿠폰 추가
                    vouchers.append({
                        "amount": "100000",
                        "description": "100,000원 할인",
                        "issued_at": issued_time.strftime('%Y-%m-%d %H:%M'),
                        "type": "discount_voucher"
                    })

                    account.owned_vouchers = json.dumps(vouchers, ensure_ascii=False)
                except Exception as e:
                    print(f"[쿠폰발급] 쿠폰 목록 업데이트 실패: {e}")

                print(f"[쿠폰발급 Task] 성공: {email}")

            else:
                # 실패 시
                error_type = result.get("error_type")
                failed_time = datetime.now(kst).strftime('%Y-%m-%d %H:%M')

                if error_type == "insufficient_points":
                    # 포인트 부족
                    coupon_status = f"쿠폰: 포인트 부족 ({failed_time})"
                    if existing_info_status:
                        account.fetch_status = f"{existing_info_status}\n{coupon_status}"
                    else:
                        account.fetch_status = coupon_status
                    print(f"[쿠폰발급 Task] 포인트 부족: {email}")

                elif error_type == "already_issued":
                    # 이미 발급됨
                    next_date = result.get("next_available_date")
                    if next_date:
                        account.next_coupon_available_date = next_date
                        coupon_status = f"쿠폰: 다음 발급일 {next_date}"
                    else:
                        coupon_status = f"쿠폰: 이미 발급됨 ({failed_time})"

                    if existing_info_status:
                        account.fetch_status = f"{existing_info_status}\n{coupon_status}"
                    else:
                        account.fetch_status = coupon_status
                    print(f"[쿠폰발급 Task] 이미 발급됨: {email}, 다음 발급일: {next_date}")

                else:
                    # 기타 실패
                    coupon_status = f"쿠폰: 발급 실패 ({failed_time})"
                    if existing_info_status:
                        account.fetch_status = f"{existing_info_status}\n{coupon_status}"
                    else:
                        account.fetch_status = coupon_status
                    print(f"[쿠폰발급 Task] 실패: {email} - {result.get('message')}")

            db.commit()

    except Exception as e:
        print(f"[쿠폰발급 Task 오류] {email}: {e}")
        import traceback
        traceback.print_exc()
    finally:
        db.close()


@router.post("/{account_id}/issue-coupon")
def issue_coupon_for_account(
    account_id: UUID,
    background_tasks: BackgroundTasks,
    request_body: IssueCouponRequest = Body(...),
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user),
):
    """
    쿠폰 발급 (모바일 자동화 - 백그라운드)

    Args:
        account_id: 계정 ID
        request_body: {"coupon_amount": "100000"}

    Returns:
        {"success": bool, "message": str}
    """
    import os
    from appium import webdriver
    from appium.options.android import UiAutomator2Options

    coupon_amount = request_body.coupon_amount

    # 계정 조회
    account = db.query(AdidasAccount).filter(AdidasAccount.id == account_id).first()
    if not account:
        raise HTTPException(status_code=404, detail="계정을 찾을 수 없습니다")

    # Appium 연결 체크
    appium_url = os.getenv("APPIUM_URL", "http://host.docker.internal:4723")
    try:
        options = UiAutomator2Options()
        options.platform_name = "Android"
        options.device_name = "emulator-5554"
        test_driver = webdriver.Remote(appium_url, options=options)
        test_driver.quit()
    except Exception as e:
        error_msg = str(e).lower()
        if 'connection' in error_msg or 'refused' in error_msg or 'timeout' in error_msg or 'max retries' in error_msg:
            raise HTTPException(status_code=503, detail="모바일 기기 연결이 되지 않았습니다")
        else:
            raise HTTPException(status_code=500, detail=f"Appium 연결 오류: {str(e)[:100]}")

    # 백그라운드 작업 추가
    background_tasks.add_task(
        issue_coupon_task,
        str(account_id),
        account.email,
        account.password,
        coupon_amount
    )

    return {"success": True, "message": f"{coupon_amount}원 쿠폰 발급을 시작했습니다"}


@router.post("/bulk-issue-coupon")
def bulk_issue_coupon(
    background_tasks: BackgroundTasks,
    account_ids: List[UUID] = Body(..., embed=True),
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user),
):
    """
    여러 계정 일괄 쿠폰 발급 (모바일 자동화 - 순차 처리)

    Args:
        account_ids: 계정 ID 리스트

    Returns:
        {"success": bool, "message": str, "count": int}
    """
    # 계정 조회
    accounts = db.query(AdidasAccount).filter(AdidasAccount.id.in_(account_ids)).all()

    if not accounts:
        raise HTTPException(status_code=404, detail="계정을 찾을 수 없습니다")

    # 활성화된 계정만 필터링
    account_list = [
        {"id": str(acc.id), "email": acc.email, "password": acc.password}
        for acc in accounts if acc.password and acc.is_active
    ]

    if not account_list:
        raise HTTPException(status_code=400, detail="활성화된 계정이 없습니다")

    background_tasks.add_task(_bulk_issue_coupon_task, account_list)

    return {
        "success": True,
        "message": f"{len(account_list)}개 계정의 쿠폰 발급을 시작했습니다. 순차적으로 처리됩니다.",
        "count": len(account_list)
    }


def _bulk_issue_coupon_task(account_list: list):
    """
    백그라운드 태스크: 여러 계정을 순차적으로 쿠폰 발급 (단일 Appium 세션 재사용)
    """
    from app.db.database import SessionLocal
    from app.services.adidas_coupon_issuance_mobile import issue_coupon_mobile_bulk
    from datetime import timezone, timedelta
    import os
    import json

    print(f"[일괄 쿠폰발급] 총 {len(account_list)}개 계정 순차 처리 시작")

    appium_url = os.getenv("APPIUM_URL", "http://127.0.0.1:4723")
    kst = timezone(timedelta(hours=9))

    # 벌크 처리용 계정 리스트 준비
    bulk_accounts = []
    for account_data in account_list:
        bulk_accounts.append({
            "id": account_data["id"],
            "email": account_data["email"],
            "password": account_data["password"],
            "coupon_amount": "100000"
        })

    # 각 계정 처리 완료 시 즉시 DB 업데이트하는 콜백 함수
    def update_db_callback(account_id, email, result, idx, total):
        """각 계정 처리 완료 시 즉시 DB 업데이트"""
        print(f"\n[일괄 쿠폰발급] {idx}/{total} - {email} DB 업데이트 시작")

        db = SessionLocal()
        try:
            # DB 업데이트
            account = db.query(AdidasAccount).filter(AdidasAccount.id == account_id).first()
            if account:
                # 기존 fetch_status 파싱 (정보조회 현황 유지)
                existing_info_status = ""
                if account.fetch_status:
                    lines = account.fetch_status.split('\n')
                    if lines:
                        existing_info_status = lines[0]

                if result.get("success"):
                    # 성공 시
                    issued_time = datetime.now(kst)
                    account.last_coupon_check = datetime.utcnow()
                    account.last_coupon_issued = datetime.utcnow()

                    # 포인트 6000 차감 (10만원 쿠폰 발급 비용)
                    if result.get("deduct_points") and account.current_points is not None:
                        old_points = account.current_points
                        account.current_points = max(0, account.current_points - 6000)
                        print(f"[일괄 쿠폰발급] {idx}/{total} - 포인트 차감: {old_points:,} P → {account.current_points:,} P (-6,000)")

                    # fetch_status 업데이트
                    coupon_status = f"쿠폰: 발급 완료 ({issued_time.strftime('%Y-%m-%d %H:%M')})"
                    if existing_info_status:
                        account.fetch_status = f"{existing_info_status}\n{coupon_status}"
                    else:
                        account.fetch_status = coupon_status

                    # 보유 쿠폰 목록에 추가
                    try:
                        if account.owned_vouchers:
                            vouchers = json.loads(account.owned_vouchers)
                        else:
                            vouchers = []

                        vouchers.append({
                            "amount": "100000",
                            "description": "100,000원 할인",
                            "issued_at": issued_time.strftime('%Y-%m-%d %H:%M'),
                            "type": "discount_voucher"
                        })

                        account.owned_vouchers = json.dumps(vouchers, ensure_ascii=False)
                    except Exception as e:
                        print(f"[일괄 쿠폰발급] {idx}/{total} - 쿠폰 목록 업데이트 실패: {e}")

                    print(f"[일괄 쿠폰발급] {idx}/{total} - {email} 성공")
                else:
                    # 실패 시
                    error_type = result.get("error_type")
                    failed_time = datetime.now(kst).strftime('%Y-%m-%d %H:%M')

                    if error_type == "insufficient_points":
                        coupon_status = f"쿠폰: 포인트 부족 ({failed_time})"
                    elif error_type == "already_issued":
                        next_date = result.get("next_available_date")
                        if next_date:
                            account.next_coupon_available_date = next_date
                            coupon_status = f"쿠폰: 다음 발급일 {next_date}"
                        else:
                            coupon_status = f"쿠폰: 이미 발급됨 ({failed_time})"
                    else:
                        coupon_status = f"쿠폰: 발급 실패 ({failed_time})"

                    if existing_info_status:
                        account.fetch_status = f"{existing_info_status}\n{coupon_status}"
                    else:
                        account.fetch_status = coupon_status

                    print(f"[일괄 쿠폰발급] {idx}/{total} - {email} 실패: {result.get('message')}")

                db.commit()
                print(f"[일괄 쿠폰발급] {idx}/{total} - {email} DB 업데이트 완료")

        except Exception as e:
            print(f"[일괄 쿠폰발급] {idx}/{total} - {email} DB 업데이트 오류: {e}")
            import traceback
            traceback.print_exc()
        finally:
            db.close()

    # 단일 Appium 세션으로 모든 계정 처리 (각 처리 후 콜백 호출)
    try:
        issue_coupon_mobile_bulk(bulk_accounts, appium_url, on_each_complete=update_db_callback)
    except Exception as e:
        print(f"[일괄 쿠폰발급] Appium 연결 실패: {e}")
        return

    print(f"\n[일괄 쿠폰발급] 전체 {len(bulk_accounts)}개 계정 처리 완료")
