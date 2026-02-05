import hashlib
import requests
from urllib.parse import quote_plus
import time
import json

# 포이즌 API 인증 정보
APP_KEY = "5acc0257eeb54da09d2d90382e805621"
APP_SECRET = "f5eecdadd2f94afb9e0351d52ae9c5140272d01d35da42b098ffd00f9c4504ee"

class PoizonAPI:
    def __init__(self, app_key, app_secret, base_url):
        self.app_key = app_key
        self.app_secret = app_secret
        self.base_url = base_url

    def calculate_sign(self, key_dict: dict):
        # Step 1: 정렬된 키 목록 가져오기
        sort_key_list = sorted(list(key_dict.keys()))
        new_str = ""

        # Step 2: URL 인코딩 및 문자열 생성
        for key in sort_key_list:
            value = key_dict.get(key)
            value_str = self.get_str(value)
            encoded_value = quote_plus(value_str, encoding="utf-8")
            new_str += f"{key}={encoded_value}&"

        # Step 3: 마지막 '&' 제거 후 app_secret 추가
        new_key = new_str[:-1] + self.app_secret

        # Step 4: MD5 해싱 및 대문자 변환
        md5_hash = hashlib.md5()
        md5_hash.update(new_key.encode("utf-8"))
        sign = md5_hash.hexdigest().upper()

        return sign, new_str[:-1]

    def get_str(self, obj, is_sub=False):
        """객체를 문자열로 변환"""
        if isinstance(obj, (list, tuple)):
            return ','.join(self.get_str(x, True) for x in obj)
        elif isinstance(obj, dict):
            value_str = "{"
            for sub_key in sorted(obj.keys()):
                value_str += f"\"{sub_key}\":{self.get_str(obj[sub_key], True)},"
            return value_str[:-1] + "}"
        elif isinstance(obj, bool):
            # Boolean을 JSON 형식으로 변환 (lowercase)
            return "true" if obj else "false"
        elif isinstance(obj, str) and is_sub:
            return f"\"{obj}\""
        else:
            return str(obj)
        
    def send_request(self, endpoint, params):
        # 현재 타임스탬프 생성
        params["timestamp"] = int(time.time() * 1000)
        params["app_key"] = self.app_key  # app_key를 정확히 전달

        # 서명 생성
        sign, request_string = self.calculate_sign(params)
        params["sign"] = sign

        # API 요청 (POST 요청)
        url = f"{self.base_url}/{endpoint}"
        print(url)
        response = requests.post(url, json=params)  # JSON 형식으로 전송
        return response.json()


# === 유틸리티 함수들 ===

def _get_str(obj, is_sub=False):
    """객체를 문자열로 변환 (내부 헬퍼)"""
    if isinstance(obj, (list, tuple)):
        return ','.join(_get_str(x, True) for x in obj)
    elif isinstance(obj, dict):
        value_str = "{"
        for sub_key in sorted(obj.keys()):
            value_str += f'"{sub_key}":{_get_str(obj[sub_key], True)},'
        return value_str[:-1] + "}"
    elif isinstance(obj, bool):
        # Boolean을 JSON 형식으로 변환 (lowercase)
        return "true" if obj else "false"
    elif isinstance(obj, str) and is_sub:
        return f'"{obj}"'
    else:
        return str(obj)


def generate_sign(params: dict, include_timestamp: bool = True) -> str:
    """
    주어진 파라미터로 sign 생성

    Args:
        params: sign 생성에 사용할 파라미터 딕셔너리
        include_timestamp: timestamp 자동 추가 여부

    Returns:
        생성된 sign 문자열
    """
    sign_params = params.copy()

    if include_timestamp:
        sign_params["timestamp"] = int(time.time() * 1000)

    # Step 1: 정렬된 키 목록 가져오기
    sort_key_list = sorted(list(sign_params.keys()))
    new_str = ""

    # Step 2: URL 인코딩 및 문자열 생성
    for key in sort_key_list:
        value = sign_params.get(key)
        value_str = _get_str(value)
        encoded_value = quote_plus(value_str, encoding="utf-8")
        new_str += f"{key}={encoded_value}&"

    # Step 3: 마지막 '&' 제거 후 app_secret 추가
    new_key = new_str[:-1] + APP_SECRET

    # Step 4: MD5 해싱 및 대문자 변환
    md5_hash = hashlib.md5()
    md5_hash.update(new_key.encode("utf-8"))
    sign = md5_hash.hexdigest().upper()

    return sign


def generate_sign_with_details(params: dict, include_timestamp: bool = True) -> dict:
    """
    sign 생성 과정을 상세히 보여주는 함수 (디버깅용)

    Args:
        params: sign 생성에 사용할 파라미터 딕셔너리
        include_timestamp: timestamp 자동 추가 여부

    Returns:
        {
            'sign': 생성된 sign,
            'params': 사용된 파라미터,
            'request_string': URL 인코딩된 문자열,
            'md5_input': MD5 해시 입력값
        }
    """
    sign_params = params.copy()

    if include_timestamp:
        sign_params["timestamp"] = int(time.time() * 1000)

    # Step 1: 정렬된 키 목록 가져오기
    sort_key_list = sorted(list(sign_params.keys()))
    new_str = ""

    # Step 2: URL 인코딩 및 문자열 생성
    for key in sort_key_list:
        value = sign_params.get(key)
        value_str = _get_str(value)
        encoded_value = quote_plus(value_str, encoding="utf-8")
        new_str += f"{key}={encoded_value}&"

    request_string = new_str[:-1]

    # Step 3: app_secret 추가
    md5_input = request_string + APP_SECRET

    # Step 4: MD5 해싱 및 대문자 변환
    md5_hash = hashlib.md5()
    md5_hash.update(md5_input.encode("utf-8"))
    sign = md5_hash.hexdigest().upper()

    return {
        'sign': sign,
        'params': sign_params,
        'request_string': request_string,
        'md5_input': md5_input,
        'timestamp': sign_params.get('timestamp')
    }


def print_sign_details(details: dict):
    """sign 생성 상세 정보를 보기 좋게 출력"""
    print("\n=== Sign 생성 상세 정보 ===")
    print(f"\n[파라미터]")
    print(json.dumps(details['params'], indent=2, ensure_ascii=False))
    print(f"\n[Request String]")
    print(details['request_string'][:200] + "..." if len(details['request_string']) > 200 else details['request_string'])
    print(f"\n[MD5 Input] (처음 100자)")
    print(details['md5_input'][:100] + "...")
    print(f"\n[생성된 Sign]")
    print(details['sign'])
    if 'timestamp' in details:
        print(f"\n[Timestamp]")
        print(details['timestamp'])
    print("\n" + "="*50 + "\n")