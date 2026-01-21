from fastapi import FastAPI, Query, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import httpx
import uuid
from datetime import datetime
from urllib.parse import unquote

app = FastAPI(title="KREAM Proxy")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
async def root():
    return {"status": "ok", "message": "KREAM Proxy Server"}


@app.get("/proxy")
async def proxy_kream(url: str = Query(..., description="KREAM API URL")):
    """KREAM API 프록시"""
    decoded_url = unquote(url)

    if "kream.co.kr" not in decoded_url:
        raise HTTPException(status_code=400, detail="Only KREAM URLs allowed")

    now = datetime.now()
    client_datetime = now.strftime("%Y%m%d%H%M%S") + "+0900"

    headers = {
        "accept": "*/*",
        "accept-language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
        "origin": "https://kream.co.kr",
        "referer": "https://kream.co.kr/",
        "sec-ch-ua": '"Google Chrome";v="143", "Chromium";v="143", "Not A(Brand";v="24"',
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": '"Windows"',
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36",
        "x-kream-api-version": "52",
        "x-kream-client-datetime": client_datetime,
        "x-kream-device-id": f"web;{str(uuid.uuid4())}",
        "x-kream-web-build-version": "25.15.7",
        "x-kream-web-request-secret": "kream-djscjsghdkd",
    }

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(decoded_url, headers=headers)
            return response.json()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
