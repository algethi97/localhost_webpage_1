import os
import sys
import argparse

# Windows 터미널 한글 및 이모지 출력 인코딩 설정
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except AttributeError:
        pass

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
import uvicorn

# 데이터베이스 및 경로 모듈
from database import STATIC_DIR, init_db

# 기능별 라우터 모듈 임포트
from routers import home, guestbook, photo

# 환경 변수 로드 (.env)
load_dotenv()

# 데이터베이스 테이블 초기화
init_db()

# FastAPI 애플리케이션 생성
app = FastAPI(
    title="Mini Project Website",
    description="FastAPI + ngrok 기반 공개 웹사이트 (대문, 방명록, 사진 갤러리)"
)

# 정적 파일 서빙 마운트 (/static)
app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")

# 페이지 및 기능별 라우터 등록
app.include_router(home.router)
app.include_router(guestbook.router)
app.include_router(photo.router)


def main():
    parser = argparse.ArgumentParser(description="미니 프로젝트 웹 서버 실행 스크립트")
    parser.add_argument(
        "--local",
        action="store_true",
        help="ngrok 없이 로컬(127.0.0.1:8000)에서만 실행하는 디버그 모드"
    )
    args = parser.parse_args()

    port = 8000

    if args.local:
        print("\n" + "=" * 60)
        print("💻 [로컬 디버그 모드] 로컬 웹 서버를 시작합니다.")
        print(f"👉 로컬 접속 주소: http://127.0.0.1:{port}")
        print("=" * 60 + "\n")
        uvicorn.run("main:app", host="127.0.0.1", port=port, reload=True)
    else:
        # ngrok 공개 모드
        auth_token = os.getenv("NGROK_AUTHTOKEN")
        domain = os.getenv("NGROK_DOMAIN")

        if not auth_token:
            print("⚠️ [경고] .env에 NGROK_AUTHTOKEN이 설정되어 있지 않습니다.")
            print("로컬 모드로 전환하여 실행합니다.")
            uvicorn.run("main:app", host="127.0.0.1", port=port, reload=True)
            return

        try:
            from pyngrok import ngrok

            # ngrok 인증 토큰 설정
            ngrok.set_auth_token(auth_token)

            # 터널 옵션
            tunnel_options = {"addr": port, "proto": "http"}
            if domain:
                tunnel_options["domain"] = domain

            print("\n" + "=" * 60, flush=True)
            print("🚀 [외부 공개 모드] ngrok 터널링을 활성화하는 중입니다...", flush=True)
            public_tunnel = ngrok.connect(**tunnel_options)
            print(f"🌟 외부 공개 URL: {public_tunnel.public_url}", flush=True)
            print(f"🏠 로컬 접속 URL: http://127.0.0.1:{port}", flush=True)
            print("=" * 60 + "\n", flush=True)

            # Uvicorn 서버 실행
            uvicorn.run(app, host="0.0.0.0", port=port)

        except Exception as e:
            print(f"❌ ngrok 연결 중 오류 발생: {e}")
            print("로컬 모드로 전환하여 서버를 기동합니다.")
            uvicorn.run(app, host="127.0.0.1", port=port)


if __name__ == "__main__":
    main()
