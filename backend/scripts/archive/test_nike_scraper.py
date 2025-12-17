"""
나이키 스크래퍼 테스트 스크립트 - 웹페이지 구조 확인용
"""
import requests
import json

def test_nike_page():
    """나이키 페이지 접근 테스트"""
    url = 'https://www.nike.com/kr/w/men-shoes-nik1zy7ok'

    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'ko-KR,ko;q=0.8,en-US;q=0.5,en;q=0.3',
    }

    session = requests.Session()
    session.headers.update(headers)

    try:
        print(f"요청 URL: {url}")
        response = session.get(url, timeout=10)
        print(f"상태 코드: {response.status_code}")
        print(f"응답 크기: {len(response.text)} bytes")

        html = response.text

        # __NEXT_DATA__ 확인
        if '__NEXT_DATA__' in html:
            print("[OK] __NEXT_DATA__ found")

            # JSON 데이터 추출
            start = html.find('<script id="__NEXT_DATA__" type="application/json">')
            if start != -1:
                start += len('<script id="__NEXT_DATA__" type="application/json">')
                end = html.find('</script>', start)
                json_str = html[start:end]

                try:
                    data = json.loads(json_str)
                    print("[OK] JSON parsed successfully")

                    # 구조 확인
                    if 'props' in data:
                        print("  - props 존재")
                        if 'pageProps' in data['props']:
                            print("  - pageProps 존재")
                            if 'initialState' in data['props']['pageProps']:
                                print("  - initialState 존재")
                                initial_state = data['props']['pageProps']['initialState']

                                # Wall 데이터 확인
                                if 'Wall' in initial_state:
                                    print("  - Wall 존재")
                                    wall = initial_state['Wall']

                                    if 'products' in wall:
                                        products = wall['products']
                                        print(f"  - 상품 {len(products)}개 발견")

                                        # 첫 번째 상품 정보 출력
                                        if products:
                                            first = products[0]
                                            print("\n첫 번째 상품 정보:")
                                            print(f"    - 이름: {first.get('title', 'N/A')}")
                                            print(f"    - 품번: {first.get('pid', 'N/A')}")
                                            print(f"    - 가격: {first.get('price', {}).get('currentPrice', 'N/A')}")
                                    else:
                                        print("  - products 키가 없음")
                                else:
                                    print("  - Wall 키가 없음")
                                    print("  - 사용 가능한 키:", list(initial_state.keys())[:10])
                except json.JSONDecodeError as e:
                    print(f"[FAIL] JSON parse error: {e}")
                    print(f"JSON 문자열 길이: {len(json_str)}")
                    print(f"JSON 시작 부분: {json_str[:200]}")
        else:
            print("[FAIL] __NEXT_DATA__ not found")

            # 다른 패턴 확인
            if 'nike' in html.lower():
                print("  - 'nike' 텍스트는 존재")
            if 'product' in html.lower():
                print("  - 'product' 텍스트는 존재")

            # HTML의 처음 부분 확인
            print(f"\nHTML 시작 부분:\n{html[:500]}")

    except requests.RequestException as e:
        print(f"요청 실패: {e}")
    except Exception as e:
        print(f"예상치 못한 오류: {e}")

if __name__ == "__main__":
    test_nike_page()