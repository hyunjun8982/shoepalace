"""
프록시 연결 테스트 스크립트
proxy_list.txt의 모든 프록시를 테스트하여 동작 여부 확인
"""
import os
import sys
import io

# stdout 인코딩 설정
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

import requests
import concurrent.futures
from datetime import datetime

def test_proxy(proxy: str, timeout: int = 5) -> dict:
    """단일 프록시 테스트"""
    result = {
        'proxy': proxy,
        'success': False,
        'response_time': None,
        'error': None
    }

    try:
        proxies = {
            'http': f'http://{proxy}',
            'https': f'http://{proxy}'
        }

        start = datetime.now()
        # 아디다스 사이트로 테스트
        response = requests.get(
            'https://www.adidas.co.kr',
            proxies=proxies,
            timeout=timeout,
            headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0'}
        )
        end = datetime.now()

        if response.status_code == 200:
            result['success'] = True
            result['response_time'] = (end - start).total_seconds()
        else:
            result['error'] = f'HTTP {response.status_code}'

    except requests.exceptions.ConnectTimeout:
        result['error'] = '연결 시간 초과'
    except requests.exceptions.ProxyError as e:
        result['error'] = '프록시 연결 실패'
    except requests.exceptions.SSLError:
        result['error'] = 'SSL 오류'
    except Exception as e:
        result['error'] = str(e)[:50]

    return result

def main():
    # 프록시 목록 파일 경로
    script_dir = os.path.dirname(os.path.abspath(__file__))
    proxy_file = os.path.join(os.path.dirname(script_dir), 'proxy_list.txt')

    if not os.path.exists(proxy_file):
        print(f"프록시 파일 없음: {proxy_file}")
        return

    # 프록시 목록 로드
    proxies = []
    with open(proxy_file, 'r', encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if line and ':' in line:
                proxies.append(line)

    print(f"=" * 60)
    print(f"프록시 연결 테스트 - 총 {len(proxies)}개")
    print(f"테스트 대상: https://www.adidas.co.kr")
    print(f"=" * 60)
    print()

    working = []
    failed = []

    # 병렬 테스트 (5개씩)
    print("테스트 진행 중...\n")

    with concurrent.futures.ThreadPoolExecutor(max_workers=5) as executor:
        future_to_proxy = {executor.submit(test_proxy, proxy): proxy for proxy in proxies}

        for i, future in enumerate(concurrent.futures.as_completed(future_to_proxy)):
            result = future.result()
            proxy = result['proxy']

            if result['success']:
                status = f"[OK] ({result['response_time']:.2f}s)"
                working.append(result)
            else:
                status = f"[FAIL] ({result['error']})"
                failed.append(result)

            print(f"[{i+1}/{len(proxies)}] {proxy} - {status}")

    # 결과 요약
    print()
    print(f"=" * 60)
    print(f"테스트 완료")
    print(f"=" * 60)
    print(f"성공: {len(working)}개")
    print(f"실패: {len(failed)}개")

    if working:
        print()
        print("=== 동작하는 프록시 목록 ===")
        # 응답 시간 순으로 정렬
        working.sort(key=lambda x: x['response_time'])
        for r in working:
            print(f"  {r['proxy']} ({r['response_time']:.2f}초)")

        # 동작하는 프록시만 새 파일로 저장
        working_file = os.path.join(os.path.dirname(script_dir), 'proxy_list_working.txt')
        with open(working_file, 'w', encoding='utf-8') as f:
            for r in working:
                f.write(f"{r['proxy']}\n")
        print(f"\n동작하는 프록시 저장됨: {working_file}")
    else:
        print("\n동작하는 프록시가 없습니다.")

if __name__ == "__main__":
    main()
