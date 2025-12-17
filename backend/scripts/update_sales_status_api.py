"""
API 엔드포인트로 판매 상태 업데이트
"""
import requests
import json

# API 기본 URL
BASE_URL = "http://localhost/api/v1"

# 관리자 로그인
def login():
    response = requests.post(
        f"{BASE_URL}/auth/login",
        data={
            "username": "admin",
            "password": "admin123"
        }
    )
    return response.json()["access_token"]

# 모든 판매 조회
def get_all_sales(token):
    response = requests.get(
        f"{BASE_URL}/sales/",
        headers={"Authorization": f"Bearer {token}"},
        params={"limit": 1000}
    )
    return response.json()["items"]

# 판매 상태 업데이트
def update_sale_status(token, sale_id, status):
    response = requests.put(
        f"{BASE_URL}/sales/{sale_id}",
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json"
        },
        json={"status": status}
    )
    return response.status_code == 200

def main():
    print("로그인 중...")
    token = login()
    print("로그인 성공!")

    print("\n판매 목록 조회 중...")
    sales = get_all_sales(token)
    print(f"총 {len(sales)}개 판매 조회 완료")

    print("\n상태 업데이트 중...")
    updated_count = 0

    for sale in sales:
        sale_number = sale.get("sale_number", "")
        total_company_amount = sale.get("total_company_amount")
        current_status = sale.get("status", "pending")

        # 회사 판매가가 있고 0보다 크면 completed, 아니면 pending
        if total_company_amount and float(total_company_amount) > 0:
            new_status = "completed"
        else:
            new_status = "pending"

        if current_status != new_status:
            if update_sale_status(token, sale["id"], new_status):
                updated_count += 1
                print(f"  {sale_number}: {current_status} -> {new_status}")

    print(f"\n완료! {updated_count}개 판매 상태 업데이트됨")

if __name__ == "__main__":
    main()
