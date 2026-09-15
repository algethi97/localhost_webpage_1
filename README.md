# 🌐 Mini Project Website (FastAPI & ngrok)

ngrok을 활용하여 누구나 접속할 수 있는 공개 웹사이트 프로젝트입니다.  
초판 웹사이트는 **메인 홈페이지(`/`)**, **실시간 방명록(`/guestbook`)**, **사진 업로드 및 갤러리(`/photo`)** 3개 핵심 페이지로 구성되어 있습니다.

---

## 🚀 주요 기능

1. **메인 홈페이지 (`/`)**
   - 방문자를 위한 감성적인 웰컴 배너
   - 방명록 및 사진첩 이동 직관적 네비게이션 카드
2. **실시간 방명록 (`/guestbook`)**
   - 글 작성 및 '보내기' 버튼 지원
   - **`Enter` 키 즉시 전송** (Shift+Enter는 줄바꿈 지원, 한글 조합 중복 방지)
   - SQLite DB(`data/guestbook.db`)에 영구 보관
   - 새로고침 없는 실시간 피드 추가
3. **사진 업로드 & 갤러리 (`/photo`)**
   - **JPG, PNG 파일 형식 제한**
   - **Pillow 기반 가짜 이미지(위장/손상 파일) 3단계 무결성 방어 장치**
   - 고유 UUID 기반 서버 로컬 스토리지(`static/uploads/`) 저장
   - 실시간 갤러리 노출 및 원본 확대 모달(Lightbox)
4. **ngrok 외부 공개 터널링**
   - `.env`에 설정된 고정 도메인(`limes-glowing-parkway.ngrok-free.dev`) 자동 연동

---

## 🛠️ 실행 방법

### 1. 로컬 디버그 모드 (로컬 개발용)
```bash
uv run python main.py --local
```
- 브라우저 접속 주소: `http://127.0.0.1:8000`
- ngrok 없이 로컬 환경에서 빠른 코드 수정 및 자동 리로드 지원

### 2. 외부 공개 모드 (배포용)
```bash
uv run python main.py
```
- 로컬 웹 서버 구동과 동시에 ngrok 터널링이 자동 활성화되어 외부 접속 링크가 콘솔에 출력됩니다.

---

## 📁 프로젝트 구조

```
mini-project_0915/
├── main.py                    # 서버 진입점, 라우터 등록 및 실행 관리
├── database.py                # 경로 상수 및 SQLite DB 초기화
├── routers/                   # 기능별 라우터 모듈
│   ├── home.py                # 메인 대문 라우터
│   ├── guestbook.py           # 방명록 라우터 & API
│   └── photo.py               # 사진 갤러리 라우터 & API
├── static/                    # 정적 리소스 (CSS, JS, 이미지)
│   ├── css/style.css          # 공통 모던 스타일시트
│   ├── js/guestbook.js        # 방명록 비동기 통신
│   ├── js/photo.js            # 사진 업로드 & 갤러리 스크립트
│   └── uploads/               # 업로드된 이미지 파일 저장소
├── templates/                 # HTML 페이지 템플릿
│   ├── index.html             # 메인 홈페이지
│   ├── guestbook.html         # 방명록 페이지
│   └── photo.html             # 사진 업로드 페이지
└── data/                      # 데이터베이스 디렉토리
    └── guestbook.db           # SQLite DB
```
