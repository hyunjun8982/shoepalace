from typing import List, Optional, Dict
from datetime import date, datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session, joinedload
from app.api.deps import get_db, get_current_user
from app.core.file_storage import file_storage
from app.models.user import User
from app.models.purchase import Purchase, PurchaseItem, PaymentType, PurchaseStatus
from app.models.product import Product
from app.models.brand import Brand
from app.models.inventory import Inventory
from app.models.warehouse import Warehouse
from app.schemas.purchase import (
    PurchaseCreate,
    PurchaseUpdate,
    Purchase as PurchaseSchema,
    PurchaseList
)
import uuid
import os
import shutil

router = APIRouter()

# 영수증 업로드 토큰 저장소 (메모리 기반, 프로덕션에서는 Redis 권장)
receipt_upload_tokens: Dict[str, dict] = {}


def cleanup_expired_receipt_tokens():
    """만료된 영수증 업로드 토큰 정리"""
    now = datetime.utcnow()
    expired = [token for token, data in receipt_upload_tokens.items() if data['expires_at'] < now]
    for token in expired:
        del receipt_upload_tokens[token]

@router.get("/next-transaction-no")
def get_next_transaction_no(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """다음 구매번호 생성 (P 접두사)"""
    from datetime import datetime

    # 오늘 날짜로 시작하는 구매번호 개수 확인
    today = datetime.now().strftime('%Y%m%d')

    # 오늘 날짜의 가장 큰 번호 찾기 (P 접두사 포함)
    last_purchase = db.query(Purchase).filter(
        Purchase.transaction_no.like(f"P{today}-%")
    ).order_by(Purchase.transaction_no.desc()).first()

    if last_purchase:
        # 마지막 번호에서 숫자 추출하여 +1
        last_num = int(last_purchase.transaction_no.split('-')[-1])
        next_num = last_num + 1
    else:
        next_num = 1

    next_no = f"P{today}-{next_num:04d}"

    return {"transaction_no": next_no}

@router.get("/", response_model=PurchaseList)
def get_purchases(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=10000),
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    payment_type: Optional[List[str]] = Query(None),
    status: Optional[List[str]] = Query(None),
    brand_name: Optional[List[str]] = Query(None),
    buyer_id: Optional[List[str]] = Query(None),
    search: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """구매 목록 조회"""
    from sqlalchemy import or_
    query = db.query(Purchase)

    # 검색 필터링 - 서브쿼리 사용 (JSON 컬럼 DISTINCT 오류 방지)
    if search:
        # 검색 조건에 맞는 Purchase ID를 먼저 찾음
        search_subquery = db.query(Purchase.id)\
            .outerjoin(PurchaseItem)\
            .outerjoin(Product, PurchaseItem.product_id == Product.id)\
            .filter(or_(
                Purchase.transaction_no.ilike(f"%{search}%"),
                Purchase.supplier.ilike(f"%{search}%"),
                Product.product_name.ilike(f"%{search}%"),
                Product.product_code.ilike(f"%{search}%")
            ))\
            .distinct()\
            .subquery()
        query = query.filter(Purchase.id.in_(search_subquery))

    # 필터링
    if start_date:
        query = query.filter(Purchase.purchase_date >= start_date)
    if end_date:
        query = query.filter(Purchase.purchase_date <= end_date)
    if payment_type:
        # 다중 선택 지원
        payment_type_enums = [PaymentType(pt) for pt in payment_type]
        query = query.filter(Purchase.payment_type.in_(payment_type_enums))
    if status:
        # 다중 선택 지원
        status_enums = [PurchaseStatus(s) for s in status]
        query = query.filter(Purchase.status.in_(status_enums))
    if brand_name:
        # 다중 선택 지원 - subquery 사용하여 DISTINCT/ORDER BY 충돌 방지
        brand_purchase_ids = db.query(Purchase.id)\
            .join(Purchase.items)\
            .join(PurchaseItem.product)\
            .join(Product.brand)\
            .filter(Brand.name.in_(brand_name))\
            .distinct()\
            .subquery()
        query = query.filter(Purchase.id.in_(brand_purchase_ids))
    if buyer_id:
        # 다중 선택 지원
        query = query.filter(Purchase.buyer_id.in_(buyer_id))

    # buyer 권한은 자신의 구매만 조회
    if current_user.role.value == "buyer":
        query = query.filter(Purchase.buyer_id == current_user.id)

    total = query.count()
    purchases = query.options(
        joinedload(Purchase.items).joinedload(PurchaseItem.product).joinedload(Product.brand),
        joinedload(Purchase.items).joinedload(PurchaseItem.warehouse),
        joinedload(Purchase.buyer),
        joinedload(Purchase.receiver)
    ).order_by(Purchase.created_at.desc()).offset(skip).limit(limit).all()

    # buyer_name, receiver_name 및 product의 brand_name 추가
    for purchase in purchases:
        if purchase.buyer:
            purchase.buyer_name = purchase.buyer.full_name
        if purchase.receiver:
            purchase.receiver_name = purchase.receiver.full_name
        # 각 item의 product에 brand_name 추가
        for item in purchase.items:
            if item.product and item.product.brand:
                item.product.brand_name = item.product.brand.name

    return PurchaseList(total=total, items=purchases)

@router.get("/{purchase_id}", response_model=PurchaseSchema)
def get_purchase(
    purchase_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """구매 상세 조회"""
    purchase = db.query(Purchase).options(
        joinedload(Purchase.items).joinedload(PurchaseItem.product).joinedload(Product.brand),
        joinedload(Purchase.items).joinedload(PurchaseItem.warehouse),
        joinedload(Purchase.buyer),
        joinedload(Purchase.receiver)
    ).filter(Purchase.id == purchase_id).first()
    if not purchase:
        raise HTTPException(status_code=404, detail="Purchase not found")

    # 권한 체크
    if current_user.role.value == "buyer" and str(purchase.buyer_id) != str(current_user.id):
        raise HTTPException(status_code=403, detail="Not authorized")

    # buyer_name, receiver_name 추가
    if purchase.buyer:
        purchase.buyer_name = purchase.buyer.full_name
    if purchase.receiver:
        purchase.receiver_name = purchase.receiver.full_name

    # product의 brand_name 추가
    for item in purchase.items:
        if item.product and item.product.brand:
            item.product.brand_name = item.product.brand.name

    return purchase

@router.post("/", response_model=PurchaseSchema)
def create_purchase(
    purchase_data: PurchaseCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """구매 등록"""
    import logging
    from datetime import datetime
    logging.info(f"Received purchase data: {purchase_data.dict()}")

    # buyer나 admin만 구매 등록 가능
    if current_user.role.value not in ["buyer", "admin"]:
        raise HTTPException(status_code=403, detail="Not authorized")

    # 입력 데이터 검증
    if not purchase_data.items or len(purchase_data.items) == 0:
        raise HTTPException(status_code=400, detail="상품을 추가해주세요")

    # 거래번호 자동 생성
    if not purchase_data.transaction_no or purchase_data.transaction_no == "":
        # 오늘 날짜로 시작하는 거래번호 개수 확인
        today = datetime.now().strftime('%Y%m%d')
        count = db.query(Purchase).filter(
            Purchase.transaction_no.like(f"{today}-%")
        ).count()
        transaction_no = f"{today}-{count + 1:04d}"
    else:
        transaction_no = purchase_data.transaction_no

    # 중복 거래번호 체크
    existing = db.query(Purchase).filter(
        Purchase.transaction_no == transaction_no
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="거래번호가 이미 존재합니다")

    # buyer_id 결정: admin이 지정하면 그 값 사용, 아니면 현재 사용자
    buyer_id = current_user.id
    if current_user.role.value == "admin" and purchase_data.buyer_id:
        buyer_id = purchase_data.buyer_id

    # 구매 생성
    purchase = Purchase(
        id=uuid.uuid4(),
        transaction_no=transaction_no,
        purchase_date=purchase_data.purchase_date,
        buyer_id=buyer_id,
        receiver_id=purchase_data.receiver_id if purchase_data.receiver_id else None,
        payment_type=purchase_data.payment_type,
        supplier=purchase_data.supplier,
        receipt_url=purchase_data.receipt_url,
        receipt_urls=purchase_data.receipt_urls or [],  # 다중 영수증 URL
        notes=purchase_data.notes,
        status=PurchaseStatus.pending,
        total_amount=0
    )

    db.add(purchase)

    # 구매 아이템 생성 및 총액 계산
    total_amount = 0.0
    for item_data in purchase_data.items:
        # 상품 확인
        try:
            # product_id가 유효한 UUID인지 확인
            import uuid as uuid_lib
            uuid_lib.UUID(item_data.product_id)
        except ValueError:
            raise HTTPException(
                status_code=400,
                detail=f"잘못된 상품 ID 형식: {item_data.product_id}. 상품을 다시 선택해주세요."
            )

        product = db.query(Product).filter(Product.id == item_data.product_id).first()
        if not product:
            raise HTTPException(
                status_code=400,
                detail=f"상품을 찾을 수 없습니다: {item_data.product_id}"
            )

        # 마진율 계산
        margin_rate = None
        if item_data.selling_price and item_data.purchase_price > 0:
            margin_rate = ((item_data.selling_price - item_data.purchase_price) / item_data.purchase_price * 100)

        item = PurchaseItem(
            id=uuid.uuid4(),
            purchase_id=purchase.id,
            warehouse_id=item_data.warehouse_id if item_data.warehouse_id else None,
            product_id=item_data.product_id,
            size=item_data.size if item_data.size else None,
            quantity=item_data.quantity,
            purchase_price=item_data.purchase_price,
            selling_price=item_data.selling_price,
            margin_rate=margin_rate,
            receipt_image_url=item_data.receipt_image_url,
            product_image_url=item_data.product_image_url,
            notes=item_data.notes
        )

        db.add(item)
        total_amount += item_data.purchase_price * item_data.quantity

        # 재고 업데이트 (사이즈별로 관리)
        inventory = db.query(Inventory).filter(
            Inventory.product_id == item_data.product_id,
            Inventory.size == item_data.size
        ).first()

        if inventory:
            inventory.quantity += item_data.quantity
        else:
            inventory = Inventory(
                id=uuid.uuid4(),
                product_id=item_data.product_id,
                size=item_data.size,
                quantity=item_data.quantity,
                reserved_quantity=0
            )
            db.add(inventory)

    # 총액 업데이트
    purchase.total_amount = total_amount

    db.commit()
    db.refresh(purchase)

    return purchase

@router.put("/{purchase_id}", response_model=PurchaseSchema)
def update_purchase(
    purchase_id: str,
    purchase_update: PurchaseUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """구매 정보 수정"""
    purchase = db.query(Purchase).filter(Purchase.id == purchase_id).first()
    if not purchase:
        raise HTTPException(status_code=404, detail="Purchase not found")

    # 권한 체크
    if current_user.role.value == "buyer" and str(purchase.buyer_id) != str(current_user.id):
        raise HTTPException(status_code=403, detail="Not authorized")

    # 업데이트
    update_data = purchase_update.dict(exclude_unset=True)

    # items를 제외한 필드 업데이트
    items_data = update_data.pop('items', None)
    for field, value in update_data.items():
        setattr(purchase, field, value)

    # items가 포함된 경우 전체 교체
    if items_data is not None:
        # 기존 items 삭제
        db.query(PurchaseItem).filter(PurchaseItem.purchase_id == purchase_id).delete()

        # 새 items 추가
        total_amount = 0.0
        for item_data in items_data:
            # 상품 확인
            product = db.query(Product).filter(Product.id == item_data['product_id']).first()
            if not product:
                raise HTTPException(status_code=400, detail=f"상품을 찾을 수 없습니다: {item_data['product_id']}")

            # 마진율 계산
            margin_rate = None
            if item_data.get('selling_price') and item_data['purchase_price'] > 0:
                margin_rate = ((item_data['selling_price'] - item_data['purchase_price']) / item_data['purchase_price'] * 100)

            item = PurchaseItem(
                id=uuid.uuid4(),
                purchase_id=purchase.id,
                product_id=item_data['product_id'],
                warehouse_id=item_data.get('warehouse_id'),
                size=item_data.get('size'),
                quantity=item_data['quantity'],
                purchase_price=item_data['purchase_price'],
                selling_price=item_data.get('selling_price'),
                margin_rate=margin_rate,
                receipt_image_url=item_data.get('receipt_image_url'),
                product_image_url=item_data.get('product_image_url'),
                notes=item_data.get('notes')
            )

            db.add(item)
            total_amount += item_data['purchase_price'] * item_data['quantity']

        # 총액 업데이트
        purchase.total_amount = total_amount

    db.commit()
    db.refresh(purchase)

    # product 정보를 포함하여 반환
    purchase = db.query(Purchase).options(
        joinedload(Purchase.items).joinedload(PurchaseItem.product)
    ).filter(Purchase.id == purchase_id).first()

    return purchase

@router.delete("/{purchase_id}")
def delete_purchase(
    purchase_id: str,
    delete_inventory: bool = Query(False, description="재고도 함께 삭제할지 여부"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """구매 삭제"""
    # admin만 삭제 가능
    if current_user.role.value != "admin":
        raise HTTPException(status_code=403, detail="Not authorized")

    purchase = db.query(Purchase).filter(Purchase.id == purchase_id).first()
    if not purchase:
        raise HTTPException(status_code=404, detail="Purchase not found")

    # 재고 처리
    if delete_inventory:
        # 재고도 함께 삭제
        items = db.query(PurchaseItem).filter(PurchaseItem.purchase_id == purchase_id).all()
        for item in items:
            inventory = db.query(Inventory).filter(
                Inventory.product_id == item.product_id,
                Inventory.size == item.size
            ).first()
            if inventory:
                inventory.quantity -= item.quantity
                # 재고가 0 이하가 되면 삭제
                if inventory.quantity <= 0:
                    db.delete(inventory)

    db.delete(purchase)
    db.commit()

    return {"message": "Purchase deleted successfully"}

@router.post("/{purchase_id}/upload-receipt")
async def upload_receipt(
    purchase_id: str,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """구매 영수증 업로드 (다중 영수증 지원 - 기존 목록에 추가)"""
    # buyer나 admin만 가능
    if current_user.role.value not in ["buyer", "admin"]:
        raise HTTPException(status_code=403, detail="Not authorized")

    purchase = db.query(Purchase).filter(Purchase.id == purchase_id).first()
    if not purchase:
        raise HTTPException(status_code=404, detail="Purchase not found")

    # 파일 저장
    try:
        # 고유한 파일명 생성
        upload_count = len(purchase.receipt_urls or []) + 1
        custom_name = f"purchase_{purchase_id}_receipt_{upload_count}_{uuid.uuid4().hex[:8]}"
        relative_path = await file_storage.save_file(
            file=file,
            file_type='purchase_receipt',
            custom_name=custom_name
        )

        # /uploads/ 접두사가 없으면 추가 (프론트엔드에서 이미지 로드용)
        file_url = f"/uploads/{relative_path}" if not relative_path.startswith('/uploads') else relative_path

        # 기존 receipt_urls에 추가
        current_urls = list(purchase.receipt_urls or [])
        current_urls.append(file_url)

        # DB 업데이트 (다중 영수증 + 하위호환용 단일 URL)
        purchase.receipt_urls = current_urls
        purchase.receipt_url = current_urls[0] if current_urls else None  # 하위 호환
        db.commit()

        return {
            "message": "Receipt uploaded successfully",
            "file_path": file_url,
            "url": file_url,
            "receipt_urls": current_urls,
            "upload_count": len(current_urls)
        }
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to upload file: {str(e)}")

@router.get("/{purchase_id}/receipt")
def download_receipt(
    purchase_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """구매 영수증 다운로드"""
    purchase = db.query(Purchase).filter(Purchase.id == purchase_id).first()
    if not purchase:
        raise HTTPException(status_code=404, detail="Purchase not found")

    if not purchase.receipt_url:
        raise HTTPException(status_code=404, detail="Receipt not found")

    # 파일 경로 가져오기
    file_path = file_storage.get_full_path(purchase.receipt_url)
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found")

    return FileResponse(
        path=file_path,
        filename=file_path.name,
        media_type='application/octet-stream'
    )

@router.post("/{purchase_id}/confirm", response_model=PurchaseSchema)
def confirm_purchase(
    purchase_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """입고 확인 처리"""
    purchase = db.query(Purchase).options(
        joinedload(Purchase.items).joinedload(PurchaseItem.product).joinedload(Product.brand),
        joinedload(Purchase.buyer),
        joinedload(Purchase.receiver)
    ).filter(Purchase.id == purchase_id).first()

    if not purchase:
        raise HTTPException(status_code=404, detail="Purchase not found")

    # 이미 확인된 경우
    if purchase.is_confirmed:
        raise HTTPException(status_code=400, detail="이미 입고확인이 완료되었습니다")

    # 입고확인 처리
    purchase.is_confirmed = True
    purchase.confirmed_at = datetime.now()
    purchase.receiver_id = current_user.id  # 확인한 사람을 입고확인자로 설정
    purchase.status = PurchaseStatus.completed  # 상태를 완료로 변경

    db.commit()
    db.refresh(purchase)

    # buyer_name, receiver_name 추가
    if purchase.buyer:
        purchase.buyer_name = purchase.buyer.full_name
    if purchase.receiver:
        purchase.receiver_name = purchase.receiver.full_name

    # product의 brand_name 추가
    for item in purchase.items:
        if item.product and item.product.brand:
            item.product.brand_name = item.product.brand.name

    return purchase

@router.post("/{purchase_id}/unconfirm", response_model=PurchaseSchema)
def unconfirm_purchase(
    purchase_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """입고 확인 취소 (admin만 가능)"""
    # admin만 취소 가능
    if current_user.role.value != "admin":
        raise HTTPException(status_code=403, detail="관리자만 입고확인을 취소할 수 있습니다")

    purchase = db.query(Purchase).options(
        joinedload(Purchase.items).joinedload(PurchaseItem.product).joinedload(Product.brand),
        joinedload(Purchase.buyer),
        joinedload(Purchase.receiver)
    ).filter(Purchase.id == purchase_id).first()

    if not purchase:
        raise HTTPException(status_code=404, detail="Purchase not found")

    # 확인되지 않은 경우
    if not purchase.is_confirmed:
        raise HTTPException(status_code=400, detail="입고확인이 되지 않은 구매입니다")

    # 입고확인 취소
    purchase.is_confirmed = False
    purchase.confirmed_at = None
    purchase.status = PurchaseStatus.pending  # 상태를 대기로 변경

    db.commit()
    db.refresh(purchase)

    # buyer_name, receiver_name 추가
    if purchase.buyer:
        purchase.buyer_name = purchase.buyer.full_name
    if purchase.receiver:
        purchase.receiver_name = purchase.receiver.full_name

    # product의 brand_name 추가
    for item in purchase.items:
        if item.product and item.product.brand:
            item.product.brand_name = item.product.brand.name

    return purchase


# ============ 영수증 QR 코드 업로드 관련 API ============

@router.post("/receipt-upload-token/generate")
def generate_receipt_upload_token(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """영수증 모바일 업로드용 임시 토큰 생성 (10분 유효)"""
    # buyer나 admin만 가능
    if current_user.role.value not in ["buyer", "admin"]:
        raise HTTPException(status_code=403, detail="Not authorized")

    # 만료된 토큰 정리
    cleanup_expired_receipt_tokens()

    # 토큰 생성
    token = uuid.uuid4().hex
    expires_at = datetime.utcnow() + timedelta(minutes=10)

    # 토큰 저장
    receipt_upload_tokens[token] = {
        'user_id': str(current_user.id),
        'user_name': current_user.full_name,
        'expires_at': expires_at,
        'uploaded_urls': []  # 업로드된 이미지 URL 목록
    }

    return {
        "token": token,
        "expires_at": expires_at.isoformat()
    }


@router.get("/receipt-upload-token/{token}/validate")
def validate_receipt_upload_token(token: str):
    """영수증 업로드 토큰 유효성 검증 (로그인 불필요)"""
    # 만료된 토큰 정리
    cleanup_expired_receipt_tokens()

    if token not in receipt_upload_tokens:
        return {"valid": False, "message": "Invalid or expired token"}

    token_data = receipt_upload_tokens[token]
    if token_data['expires_at'] < datetime.utcnow():
        del receipt_upload_tokens[token]
        return {"valid": False, "message": "Token expired"}

    return {
        "valid": True,
        "user_name": token_data['user_name'],
        "upload_count": len(token_data['uploaded_urls'])
    }


@router.post("/receipt-upload-token/{token}/upload")
async def upload_receipt_with_token(
    token: str,
    file: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    """토큰 기반 영수증 이미지 업로드 (로그인 불필요, 여러 장 가능)"""
    # 토큰 검증
    cleanup_expired_receipt_tokens()

    if token not in receipt_upload_tokens:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    token_data = receipt_upload_tokens[token]
    if token_data['expires_at'] < datetime.utcnow():
        del receipt_upload_tokens[token]
        raise HTTPException(status_code=401, detail="Token expired")

    # 파일 확장자 검증
    allowed_extensions = {'.jpg', '.jpeg', '.png', '.gif', '.webp'}
    file_ext = os.path.splitext(file.filename)[1].lower()
    if file_ext not in allowed_extensions:
        raise HTTPException(status_code=400, detail="지원하지 않는 파일 형식입니다.")

    # 업로드 폴더 생성
    upload_dir = "uploads/receipts"
    os.makedirs(upload_dir, exist_ok=True)

    # 파일명 생성 (토큰_순번_uuid)
    upload_count = len(token_data['uploaded_urls']) + 1
    filename = f"{token[:8]}_{upload_count}_{uuid.uuid4().hex[:8]}{file_ext}"
    file_path = os.path.join(upload_dir, filename)

    # 파일 저장
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    # URL 생성
    file_url = f"/uploads/receipts/{filename}"

    # 토큰에 업로드된 이미지 URL 추가
    receipt_upload_tokens[token]['uploaded_urls'].append(file_url)

    return {
        "message": "영수증 업로드 완료",
        "url": file_url,
        "upload_count": len(receipt_upload_tokens[token]['uploaded_urls'])
    }


@router.get("/receipt-upload-token/{token}/status")
def get_receipt_upload_status(token: str):
    """영수증 업로드 상태 확인 (PC에서 폴링용)"""
    cleanup_expired_receipt_tokens()

    if token not in receipt_upload_tokens:
        return {"valid": False, "uploaded_urls": []}

    token_data = receipt_upload_tokens[token]
    return {
        "valid": True,
        "uploaded_urls": token_data['uploaded_urls'],
        "upload_count": len(token_data['uploaded_urls'])
    }


@router.delete("/receipt-upload-token/{token}/images/{index}")
def delete_receipt_from_token(token: str, index: int):
    """토큰에서 특정 영수증 이미지 삭제"""
    cleanup_expired_receipt_tokens()

    if token not in receipt_upload_tokens:
        raise HTTPException(status_code=404, detail="Token not found")

    token_data = receipt_upload_tokens[token]
    if index < 0 or index >= len(token_data['uploaded_urls']):
        raise HTTPException(status_code=404, detail="Image not found")

    # URL 목록에서 제거
    removed_url = token_data['uploaded_urls'].pop(index)

    return {
        "message": "이미지가 삭제되었습니다.",
        "removed_url": removed_url,
        "remaining_count": len(token_data['uploaded_urls'])
    }