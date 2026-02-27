"""
CODEF API 연동 서비스
- OAuth 토큰 관리
- RSA 암호화
- 보유카드 조회
- 승인내역 조회 및 동기화
"""
import base64
import json
import time
from datetime import datetime, date
from typing import Optional
from uuid import UUID
from urllib import parse

import requests
from sqlalchemy.orm import Session

from app.models.codef_setting import CodefSetting
from app.models.card_transaction import CardTransaction
from app.models.bank_transaction import BankTransaction
from app.crud.crud_card_transaction import (
    upsert_codef_setting, upsert_codef_account, get_user_connected_id,
    get_daily_api_call_count, record_api_call,
)


# 토큰 캐시 (메모리)
_token_cache = {
    "access_token": None,
    "expires_at": 0,
}


def _get_setting(db: Session, key: str) -> str:
    """DB에서 CODEF 설정값 조회"""
    setting = db.query(CodefSetting).filter(CodefSetting.setting_key == key).first()
    if not setting or not setting.setting_value:
        return ""
    return setting.setting_value


def _get_all_settings(db: Session) -> dict:
    """모든 CODEF 설정값 조회"""
    settings = db.query(CodefSetting).all()
    return {s.setting_key: s.setting_value or "" for s in settings}


def get_access_token(db: Session) -> str:
    """CODEF OAuth 토큰 발급 (캐시 활용)"""
    global _token_cache

    # 캐시된 토큰이 유효하면 재사용 (만료 60초 전에 갱신)
    if _token_cache["access_token"] and time.time() < _token_cache["expires_at"] - 60:
        return _token_cache["access_token"]

    settings = _get_all_settings(db)
    use_demo = settings.get("use_demo", "true").lower() == "true"

    client_id = settings.get("client_id", "")
    client_secret = settings.get("client_secret", "")

    if not client_id or not client_secret:
        raise ValueError("CODEF client_id 또는 client_secret이 설정되지 않았습니다.")

    # Basic Auth 헤더
    client_info = f"{client_id}:{client_secret}"
    b64_auth = base64.b64encode(client_info.encode('utf-8')).decode('utf-8')

    token_url = "https://oauth.codef.io/oauth/token"
    headers = {
        "Accept": "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
        "Authorization": f"Basic {b64_auth}",
    }
    body = "grant_type=client_credentials&scope=read"

    resp = requests.post(token_url, data=body, headers=headers, timeout=30)
    if resp.status_code != 200:
        raise RuntimeError(f"CODEF 토큰 발급 실패: {resp.status_code} - {resp.text}")

    data = resp.json()
    access_token = data.get("access_token")
    if not access_token:
        raise RuntimeError(f"CODEF 토큰 응답에 access_token이 없음: {data}")

    # 캐시 저장 (기본 1시간 유효)
    expires_in = data.get("expires_in", 3600)
    _token_cache["access_token"] = access_token
    _token_cache["expires_at"] = time.time() + expires_in

    return access_token


def encrypt_rsa(text: str, public_key: str) -> str:
    """RSA 암호화 (카드 비밀번호 등)"""
    try:
        from Crypto.PublicKey import RSA
        from Crypto.Cipher import PKCS1_v1_5 as PKCS1

        if not public_key or not public_key.strip():
            raise ValueError("RSA Public Key가 설정되지 않았습니다.")

        key_der = base64.b64decode(public_key)
        key_pub = RSA.import_key(key_der)
        cipher = PKCS1.new(key_pub)
        cipher_text = cipher.encrypt(text.encode('utf-8'))
        return base64.b64encode(cipher_text).decode('utf-8')
    except ImportError:
        raise RuntimeError("pycryptodome 패키지가 설치되지 않았습니다. pip install pycryptodome")


def _get_base_url(db: Session) -> str:
    """서버 URL 결정"""
    use_demo = _get_setting(db, "use_demo").lower() == "true"
    if use_demo:
        return "https://development.codef.io"
    return "https://api.codef.io"


def _check_daily_limit(db: Session) -> None:
    """데모 서버 일일 호출 제한 체크"""
    use_demo = _get_setting(db, "use_demo").lower() == "true"
    if not use_demo:
        return  # 운영 서버는 제한 없음

    daily_count = get_daily_api_call_count(db)
    if daily_count >= 100:
        raise ValueError(
            f"CODEF 데모 서버 일일 API 호출 한도(100건)를 초과했습니다. "
            f"오늘 {daily_count}건 호출됨. 내일 다시 시도해주세요."
        )


def _call_api(db: Session, endpoint: str, params: dict, caller_user_id: Optional[UUID] = None) -> dict:
    """CODEF API 호출 공통 함수"""
    # 일일 호출 제한 체크
    _check_daily_limit(db)

    access_token = get_access_token(db)
    base_url = _get_base_url(db)

    url = base_url + endpoint
    headers = {
        "Accept": "application/json",
        "Authorization": f"Bearer {access_token}",
    }

    # 디버그 로깅
    print(f"[CODEF API] POST {url}")
    safe_params = {k: ("***" if k in ("password",) else v) for k, v in params.items()}
    print(f"[CODEF API] Params: {json.dumps(safe_params, ensure_ascii=False, default=str)[:500]}")

    resp = requests.post(url, json=params, headers=headers, timeout=60)
    print(f"[CODEF API] Status: {resp.status_code}")
    print(f"[CODEF API] Response: {parse.unquote_plus(resp.text[:1000])}")

    # 응답 파싱
    try:
        result = resp.json()
    except (json.JSONDecodeError, ValueError):
        try:
            decoded_text = parse.unquote(resp.text)
            result = json.loads(decoded_text)
        except Exception:
            # 파싱 실패도 기록
            record_api_call(db, endpoint, user_id=caller_user_id, status_code=resp.status_code, error_message="응답 파싱 실패")
            raise RuntimeError(f"CODEF API 응답 파싱 실패: {resp.text[:500]}")

    # URL 디코딩된 응답 처리
    if isinstance(result, str):
        try:
            result = json.loads(parse.unquote(result))
        except Exception:
            pass

    # API 호출 로그 기록
    res_code = result.get("result", {}).get("code", "") if isinstance(result, dict) else ""
    error_msg = None
    if res_code and res_code != "CF-00000":
        error_msg = result.get("result", {}).get("message", "")
    record_api_call(
        db, endpoint,
        user_id=caller_user_id,
        status_code=resp.status_code,
        res_code=res_code,
        error_message=error_msg,
    )

    daily_count = get_daily_api_call_count(db)
    print(f"[CODEF API] 오늘 API 호출: {daily_count}/100건")

    return result


def get_card_list(db: Session, organization: str, user_id: Optional[UUID] = None, client_type: str = "P") -> list[dict]:
    """보유카드 조회"""
    connected_id = get_user_connected_id(db, user_id, client_type) if user_id else _get_setting(db, "connected_id")
    if not connected_id:
        raise ValueError("CODEF connected_id가 설정되지 않았습니다. 먼저 카드사 계정을 등록해주세요.")

    path_type = "b" if client_type == "B" else "p"

    params = {
        "organization": organization,
        "connectedId": connected_id,
    }

    result = _call_api(db, f"/v1/kr/card/{path_type}/account/card-list", params, caller_user_id=user_id)

    # 응답 확인
    res_code = result.get("result", {}).get("code", "")
    if res_code != "CF-00000":
        error_msg = result.get("result", {}).get("message", "알 수 없는 오류")
        raise RuntimeError(f"보유카드 조회 실패 [{res_code}]: {error_msg}")

    cards = result.get("data", [])
    return [
        {
            "card_name": card.get("resCardName", ""),
            "card_no": card.get("resCardNo", ""),
            "card_type": card.get("resCardType", ""),
            "user_name": card.get("resUserNm", ""),
            "is_sleep": card.get("resSleepYN", ""),
            "state": card.get("resState", ""),
            "image_link": card.get("resImageLink", ""),
        }
        for card in cards
    ]


def fetch_approval_list(
    db: Session,
    organization: str,
    start_date: str,
    end_date: str,
    inquiry_type: str = "1",
    card_no: Optional[str] = None,
    member_store_info_type: str = "3",
    user_id: Optional[UUID] = None,
    client_type: str = "P",
) -> list[dict]:
    """승인내역 조회 (CODEF API 호출만, DB 저장 안함)"""
    connected_id = get_user_connected_id(db, user_id, client_type) if user_id else _get_setting(db, "connected_id")
    if not connected_id:
        raise ValueError("CODEF connected_id가 설정되지 않았습니다. 먼저 카드사 계정을 등록해주세요.")

    path_type = "b" if client_type == "B" else "p"

    params = {
        "organization": organization,
        "connectedId": connected_id,
        "startDate": start_date,
        "endDate": end_date,
        "orderBy": "0",  # 최신순
        "inquiryType": inquiry_type,
        "memberStoreInfoType": member_store_info_type,
    }

    if card_no and inquiry_type == "0":
        params["cardNo"] = card_no

    result = _call_api(db, f"/v1/kr/card/{path_type}/account/approval-list", params, caller_user_id=user_id)

    # 응답 확인
    res_code = result.get("result", {}).get("code", "")
    if res_code != "CF-00000":
        error_msg = result.get("result", {}).get("message", "알 수 없는 오류")
        raise RuntimeError(f"승인내역 조회 실패 [{res_code}]: {error_msg}")

    raw_items = result.get("data", [])
    return raw_items


def _parse_cancel_status(value: str) -> str:
    """취소여부 코드를 상태 문자열로 변환"""
    mapping = {
        "0": "normal",
        "1": "cancelled",
        "2": "partial",
        "3": "rejected",
    }
    return mapping.get(value, "normal")


def _parse_amount(value) -> Optional[float]:
    """금액 문자열을 float로 변환"""
    if value is None or value == "":
        return None
    try:
        # 쉼표 제거 후 변환
        cleaned = str(value).replace(",", "").strip()
        if not cleaned:
            return None
        return float(cleaned)
    except (ValueError, TypeError):
        return None


def _parse_date(value: str) -> Optional[date]:
    """날짜 문자열(YYYYMMDD)을 date로 변환"""
    if not value or len(value) < 8:
        return None
    try:
        return datetime.strptime(value[:8], "%Y%m%d").date()
    except (ValueError, TypeError):
        return None


def sync_approval_list(
    db: Session,
    organization: str,
    start_date: str,
    end_date: str,
    inquiry_type: str = "1",
    card_no: Optional[str] = None,
    member_store_info_type: str = "3",
    user_id: Optional[UUID] = None,
    owner_name: Optional[str] = None,
    client_type: str = "P",
) -> dict:
    """승인내역 동기화 (API 호출 + DB upsert)"""
    raw_items = fetch_approval_list(
        db, organization, start_date, end_date,
        inquiry_type, card_no, member_store_info_type,
        user_id=user_id,
        client_type=client_type,
    )

    new_count = 0
    updated_count = 0
    now = datetime.utcnow()

    for item in raw_items:
        used_date = _parse_date(item.get("resUsedDate", ""))
        if not used_date:
            continue

        approval_no = item.get("resApprovalNo", "")
        card_no_val = item.get("resCardNo", "")
        is_foreign = item.get("resHomeForeignType", "1") == "2"

        # 기존 레코드 확인 (중복 방지)
        existing = db.query(CardTransaction).filter(
            CardTransaction.organization == organization,
            CardTransaction.approval_no == approval_no,
            CardTransaction.used_date == used_date,
            CardTransaction.card_no == card_no_val,
        ).first()

        tx_data = {
            "organization": organization,
            "card_name": item.get("resCardName", ""),
            "card_no": card_no_val,
            "used_date": used_date,
            "used_time": item.get("resUsedTime", ""),
            "merchant_name": item.get("resMemberStoreName", ""),
            "used_amount": _parse_amount(item.get("resUsedAmount", 0)) or 0,
            "payment_type": item.get("resPaymentType", ""),
            "installment_month": int(item.get("resInstallmentMonth", 0) or 0) if item.get("resInstallmentMonth") else None,
            "currency_code": item.get("resAccountCurrency", "KRW"),
            "is_domestic": not is_foreign,
            "krw_amount": _parse_amount(item.get("resKRWAmt")),
            "approval_no": approval_no,
            "payment_due_date": item.get("resPaymentDueDate", ""),
            "cancel_status": _parse_cancel_status(item.get("resCancelYN", "0")),
            "cancel_amount": _parse_amount(item.get("resCancelAmount")),
            "vat": _parse_amount(item.get("resVAT")),
            "service_fee": _parse_amount(item.get("resCashBack")),
            "merchant_corp_no": item.get("resMemberStoreCorpNo", ""),
            "merchant_type": item.get("resMemberStoreType", ""),
            "merchant_tel": item.get("resMemberStoreTelNo", ""),
            "merchant_addr": item.get("resMemberStoreAddr", ""),
            "merchant_no": item.get("resMemberStoreNo", ""),
            "synced_at": now,
            "raw_data": json.dumps(item, ensure_ascii=False),
            "user_id": user_id,
            "owner_name": owner_name,
            "client_type": client_type,
        }

        if existing:
            # 기존 레코드 업데이트
            for key, value in tx_data.items():
                setattr(existing, key, value)
            updated_count += 1
        else:
            # 새 레코드 생성
            new_tx = CardTransaction(**tx_data)
            db.add(new_tx)
            new_count += 1

    db.commit()

    return {
        "total_count": len(raw_items),
        "new_count": new_count,
        "updated_count": updated_count,
        "message": f"동기화 완료: 총 {len(raw_items)}건 (신규 {new_count}건, 업데이트 {updated_count}건)",
    }


def register_account(
    db: Session,
    organization: str,
    login_id: str,
    password: str,
    card_no: Optional[str] = None,
    card_password: Optional[str] = None,
    client_type: str = "P",
    business_type: str = "CD",
    user_id: Optional[UUID] = None,
    owner_name: Optional[str] = None,
) -> dict:
    """카드사/은행 계정 등록 → connected_id 발급

    - connected_id가 없으면: /v1/account/create (신규 생성)
    - connected_id가 있으면: /v1/account/add (기관 추가)
    - 비밀번호는 RSA 암호화 후 전송
    - 발급된 connected_id는 사용자별 codef_accounts에 저장
    - business_type: "CD"=카드, "BK"=은행
    """
    public_key = _get_setting(db, "public_key")
    if not public_key:
        raise ValueError("RSA Public Key가 설정되지 않았습니다. 먼저 CODEF 설정에서 Public Key를 입력해주세요.")

    encrypted_password = encrypt_rsa(password, public_key)
    # 사용자별 connected_id 조회 (같은 client_type 우선, 없으면 전역 설정 fallback)
    connected_id = get_user_connected_id(db, user_id, client_type) if user_id else _get_setting(db, "connected_id")

    account_info = {
        "countryCode": "KR",
        "businessType": business_type,
        "clientType": client_type,
        "organization": organization,
        "loginType": "1",
        "id": login_id,
        "password": encrypted_password,
    }

    # 카드사별 추가 파라미터 (현대카드 등은 카드번호 필수)
    if card_no:
        account_info["cardNo"] = card_no
    if card_password:
        account_info["cardPassword"] = encrypt_rsa(card_password, public_key)

    if connected_id:
        # 기존 connected_id에 카드사 추가
        endpoint = "/v1/account/add"
        params = {
            "connectedId": connected_id,
            "accountList": [account_info],
        }
    else:
        # 신규 계정 생성
        endpoint = "/v1/account/create"
        params = {
            "accountList": [account_info],
        }

    result = _call_api(db, endpoint, params, caller_user_id=user_id)

    # 응답 확인
    res_code = result.get("result", {}).get("code", "")

    # CF-04004: 이미 등록된 기관 → /v1/account/update로 재시도
    if res_code == "CF-04000" and connected_id:
        error_list = result.get("data", {}).get("errorList", [])
        has_duplicate = any(e.get("code") == "CF-04004" for e in error_list)
        if has_duplicate:
            endpoint = "/v1/account/update"
            params = {
                "connectedId": connected_id,
                "accountList": [account_info],
            }
            result = _call_api(db, endpoint, params, caller_user_id=user_id)
            res_code = result.get("result", {}).get("code", "")

    if res_code != "CF-00000":
        error_msg = result.get("result", {}).get("message", "알 수 없는 오류")
        error_msg = parse.unquote_plus(error_msg)
        raise RuntimeError(f"계정 등록 실패 [{res_code}]: {error_msg}")

    # connected_id 추출 및 저장
    data = result.get("data", {})
    new_connected_id = data.get("connectedId", "")

    # 사용자별 codef_accounts에 저장
    if user_id:
        upsert_codef_account(
            db,
            user_id=user_id,
            organization=organization,
            login_id=login_id,
            card_no=card_no,
            connected_id=new_connected_id or connected_id,
            owner_name=owner_name,
            is_connected=True,
            client_type=client_type,
        )
    else:
        # fallback: 전역 설정에 저장 (하위 호환, user_id 없는 경우)
        if new_connected_id:
            upsert_codef_setting(db, "connected_id", new_connected_id)

    action = "추가" if connected_id else "생성"
    return {
        "connected_id": new_connected_id,
        "organization": organization,
        "message": f"카드사 계정 연동 {action} 완료 (connected_id: {new_connected_id[:8]}...)",
    }


def fetch_bank_transaction_list(
    db: Session,
    organization: str,
    account: str,
    start_date: str,
    end_date: str,
    user_id: Optional[UUID] = None,
    client_type: str = "B",
) -> list[dict]:
    """은행 수시입출 거래내역 조회 (CODEF API 호출만, DB 저장 안함)"""
    connected_id = get_user_connected_id(db, user_id, client_type) if user_id else _get_setting(db, "connected_id")
    if not connected_id:
        raise ValueError("CODEF connected_id가 설정되지 않았습니다. 먼저 은행 계정을 등록해주세요.")

    path_type = "b" if client_type == "B" else "p"

    params = {
        "organization": organization,
        "connectedId": connected_id,
        "account": account,
        "startDate": start_date,
        "endDate": end_date,
        "orderBy": "0",  # 최신순
        "inquiryType": "1",  # 계좌상세 포함
    }

    result = _call_api(db, f"/v1/kr/bank/{path_type}/account/transaction-list", params, caller_user_id=user_id)

    # 응답 확인
    res_code = result.get("result", {}).get("code", "")
    if res_code != "CF-00000":
        error_msg = result.get("result", {}).get("message", "알 수 없는 오류")
        error_msg = parse.unquote_plus(error_msg)
        raise RuntimeError(f"거래내역 조회 실패 [{res_code}]: {error_msg}")

    data = result.get("data", {})
    raw_items = data.get("resTrHistoryList", [])

    # 계좌 상세정보도 함께 반환
    account_info = {
        "account_no": data.get("resAccount", ""),
        "account_name": data.get("resAccountName", ""),
        "account_holder": data.get("resAccountHolder", ""),
        "account_balance": data.get("resAccountBalance", ""),
    }

    return raw_items, account_info


def sync_bank_transactions(
    db: Session,
    organization: str,
    account: str,
    start_date: str,
    end_date: str,
    user_id: Optional[UUID] = None,
    owner_name: Optional[str] = None,
    client_type: str = "B",
) -> dict:
    """은행 거래내역 동기화 (API 호출 + DB upsert)"""
    raw_items, account_info = fetch_bank_transaction_list(
        db, organization, account, start_date, end_date,
        user_id=user_id, client_type=client_type,
    )

    new_count = 0
    updated_count = 0
    now = datetime.utcnow()

    for item in raw_items:
        tr_date = _parse_date(item.get("resAccountTrDate", ""))
        if not tr_date:
            continue

        tr_time = item.get("resAccountTrTime", "")
        amount_out = _parse_amount(item.get("resAccountOut", 0)) or 0
        amount_in = _parse_amount(item.get("resAccountIn", 0)) or 0
        balance = _parse_amount(item.get("resAfterTranBalance", 0)) or 0
        account_no = account_info.get("account_no", account)

        # 기존 레코드 확인 (중복 방지)
        existing = db.query(BankTransaction).filter(
            BankTransaction.organization == organization,
            BankTransaction.account_no == account_no,
            BankTransaction.tr_date == tr_date,
            BankTransaction.tr_time == tr_time,
            BankTransaction.tr_amount_out == amount_out,
            BankTransaction.tr_amount_in == amount_in,
            BankTransaction.balance == balance,
        ).first()

        tx_data = {
            "organization": organization,
            "account_no": account_no,
            "account_name": account_info.get("account_name", ""),
            "account_holder": account_info.get("account_holder", ""),
            "tr_date": tr_date,
            "tr_time": tr_time,
            "description1": item.get("resAccountDesc1", ""),
            "description2": item.get("resAccountDesc2", ""),
            "description3": item.get("resAccountDesc3", ""),
            "description4": item.get("resAccountDesc4", ""),
            "tr_amount_out": amount_out,
            "tr_amount_in": amount_in,
            "balance": balance,
            "currency": "KRW",
            "synced_at": now,
            "raw_data": json.dumps(item, ensure_ascii=False),
            "user_id": user_id,
            "owner_name": owner_name,
        }

        if existing:
            for key, value in tx_data.items():
                setattr(existing, key, value)
            updated_count += 1
        else:
            new_tx = BankTransaction(**tx_data)
            db.add(new_tx)
            new_count += 1

    db.commit()

    return {
        "total_count": len(raw_items),
        "new_count": new_count,
        "updated_count": updated_count,
        "message": f"동기화 완료: 총 {len(raw_items)}건 (신규 {new_count}건, 업데이트 {updated_count}건)",
    }


def get_connected_accounts(db: Session, user_id: Optional[UUID] = None) -> list[dict]:
    """CODEF에 연결된 계정 목록 조회"""
    connected_id = get_user_connected_id(db, user_id) if user_id else _get_setting(db, "connected_id")
    if not connected_id:
        return []

    try:
        result = _call_api(db, "/v1/account/connectedId-list", {
            "connectedId": connected_id,
        }, caller_user_id=user_id)

        res_code = result.get("result", {}).get("code", "")
        if res_code != "CF-00000":
            return []

        data = result.get("data", [])
        accounts = []
        for item in data:
            accounts.append({
                "connected_id": item.get("connectedId", ""),
                "organization_list": [
                    acc.get("organization", "")
                    for acc in item.get("accountList", [])
                ],
            })
        return accounts
    except Exception:
        # 목록 조회 실패 시 빈 리스트 반환
        return []
