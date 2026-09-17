# 🌐 NaJakHome - Mini Project Website (FastAPI & ngrok)

FastAPI와 ngrok을 기반으로 구축된 반응형 웹 애플리케이션입니다.  
**메인 대문(`/`)**, **실시간 방명록(`/guestbook`)**, **사진 갤러리(`/photo`)**, **만다린 퍼즐 게임(`/mandarin`)** 4개 핵심 페이지와 견고한 보안 체계를 갖추고 있습니다.

- **GitHub 저장소**: [https://github.com/algethi97/localhost_webpage_1](https://github.com/algethi97/localhost_webpage_1)
- **최신 버전**: `v1.1.0`

---

## 🚀 주요 기능

### 1. 메인 대문 (`/`)
- 방문자를 위한 직관적인 웰컴 히어로 섹션
- 방명록, 사진 갤러리, 만다린 게임으로 이어지는 3분할 반응형 카드 그리드
- 스크롤을 끝까지 내렸을 때 발동하는 위트 있는 '다만!' 스크롤 감지 비비드 레드(Vivid Red) 테마 연출

### 2. 실시간 방명록 (`/guestbook`)
- **실시간 작성 및 피드 노출**: 새로고침 없이 작성한 글이 최상단에 즉시 애니메이션과 함께 렌더링
- **스마트 키보드 인터랙션**: `Enter` 키 즉시 전송, `Shift + Enter` 줄바꿈 지원 (한글 IME 조합 중복 전송 방지)
- **실시간 글자 수 카운터**: 최대 500자 실시간 카운팅 UI (`0/500자`) 및 도달 시 시각적 경고
- **봇(Bot) 스팸 차단 허니팟(Honeypot)**: 일반 사용자에게는 숨겨진 허니팟 필드를 배치하여 악성 크롤러 및 자동화 도배 봇 원천 차단 (`HTTP 400 Bad Request`)
- **영구 보관**: SQLite DB(`data/guestbook.db`)에 안전하게 기록

### 3. 사진 갤러리 (`/photo`)
- **최대 30MB 고화소 사진 지원**: 최신 스마트폰의 고화소 사진도 튕김 없이 여유롭게 업로드 가능 (30MB 초과 시 `HTTP 413` 차단)
- **개인정보 보호 (EXIF GPS 위치 정보 100% 삭제)**: 스마트폰 촬영 시 사진 파일에 포함되는 집 주소/GPS 위도·경도, 카메라 기종 메타데이터를 영구 제거하여 개인위치 유출 원천 방어
- **스마트폰 회전각 자동 보정**: `ImageOps.exif_transpose`를 적용하여 사진의 가로/세로 방향 유지
- **2048px 웹 최적화 리사이징**: 초대형 사진을 고품질(LANCZOS)로 비율에 맞게 리사이징 & 고품질 압축 저장하여 30MB 원본이 약 1~2MB로 대폭 다이어트 & 갤러리 로딩 속도 극대화
- **위장/손상 파일 차단**: Pillow 디코딩 검증(`img.verify()`)으로 확장자만 바꾼 가짜 파일 즉각 차단
- **반응형 갤러리 & 원본 확대 모달**: 업로드된 사진들을 격자형으로 감상하고 클릭 시 원본 라이트박스(Lightbox) 모달 제공

### 4. 만다린 퍼즐 게임 (`/mandarin`)
- **과일 상자(Fruit Box) 모티브 퍼즐**: 마우스 또는 터치 드래그로 영역 내 귤 타일의 숫자 합이 **10**이 되도록 상자를 만들어 터뜨리는 17×10 그리드 퍼즐
- **Web Audio API 팝핑 사운드 엔진**: 외부 음원 다운로드 없는 브라우저 내장 오디오 신디사이저 기반 Pop 효과음 연출 (상단 HUD의 🔊 버튼으로 실시간 음소거 토글 가능)
- **120초 타이머 & 올클리어 보너스**: 실시간 남은 시간 게이지 바, 남은 귤 카운트, 올클리어 시 특별 보너스(+50점) 점수 시스템
- **실시간 명예의 전당 (Top 5)**: Supabase 클라우드 데이터베이스(`mandarin-game_scores`)와 실시간 연동되어 플레이 종료 후 닉네임을 등록하면 사이드 랭킹보드에 즉각 순위 반영

### 5. ngrok 외부 공개 터널링 & 안전 종료
- `.env`에 설정된 고정 도메인(`NGROK_DOMAIN`)과 인증 토큰(`NGROK_AUTHTOKEN`) 자동 연동
- 터미널에서 `Ctrl + C`로 서버 종료 시 백그라운드 ngrok 터널 프로세스까지 100% 확실하게 자동 회수

---

## 🛠️ 실행 방법

### 1. 원클릭 실행 (Windows 추천)
프로젝트 루트의 **`run_server.bat`** 파일을 더블 클릭합니다.
- UTF-8 BOM 인코딩 적용으로 명령 프롬프트(cmd)에서 한글 깨짐 없이 선명하게 메뉴가 표시됩니다.
- `[1]` 입력(또는 Enter): 로컬 디버그 모드 실행 (`http://127.0.0.1:8000`)
- `[2]` 입력: ngrok 외부 공개 모드 실행

### 2. 터미널 수동 실행

#### 로컬 디버그 모드 (개발용)
```bash
uv run python main.py --local
```
- 브라우저 접속: `http://127.0.0.1:8000`
- 자동 리로드(Hot Reload) 지원

#### 외부 공개 모드 (배포용)
```bash
uv run python main.py
```
- ngrok 터널링이 가동되어 외부 접속용 퍼블릭 URL이 콘솔에 출력됩니다.

---

## 📁 프로젝트 구조

```
mini-project_0915/
├── main.py                    # 서버 진입점, FastAPI 앱 설정 및 ngrok 관리
├── database.py                # 디렉토리 경로 상수 및 SQLite DB 초기화
├── run_server.bat             # Windows 원클릭 서버 실행기 (UTF-8 BOM)
├── routers/                   # 기능별 라우터 모듈
│   ├── home.py                # 메인 대문 라우터 (/)
│   ├── guestbook.py           # 방명록 라우터 & API (/guestbook)
│   ├── photo.py               # 사진 갤러리 라우터 & API (/photo)
│   └── game.py                # 만다린 게임 라우터 (/mandarin)
├── static/                    # 정적 리소스 (CSS, JS, 이미지, 업로드)
│   ├── css/
│   │   ├── style.css          # 공통 모던 테마 스타일시트
│   │   └── game.css           # 만다린 게임 및 사이드 랭킹 전용 스타일시트
│   ├── js/
│   │   ├── guestbook.js       # 방명록 실시간 비동기 통신 & 카운터
│   │   ├── photo.js           # 사진 업로드 & 라이트박스 갤러리 스크립트
│   │   └── game.js            # 만다린 게임 엔진, Web Audio API & Supabase 연동
│   ├── images/
│   │   └── mandarin.png       # 만다린 퍼즐 귤 비주얼 에셋
│   └── uploads/               # 최적화된 사진 저장소 (Git 추적 제외)
├── templates/                 # HTML 페이지 템플릿
│   ├── index.html             # 메인 대문
│   ├── guestbook.html         # 실시간 방명록
│   ├── photo.html             # 사진 갤러리
│   └── game.html              # 만다린 게임
└── data/                      # 데이터베이스 디렉토리
    └── guestbook.db           # 방명록 SQLite DB (Git 추적 제외)
```

---

## 📜 버전 이력 (Changelog)

### `v1.1.0` (2026-09-17)
- **만다린 퍼즐 게임 이식**: 17×10 그리드 10 만들기 게임, Web Audio API Pop 효과음, Supabase 실시간 명예의 전당 Top 5 구축 (`/mandarin`)
- **사진 갤러리 보안 및 최적화**: 스마트폰 EXIF GPS 위치 정보 영구 삭제, 30MB 대용량 허용, 2048px 웹 최적화 리사이징(LANCZOS)
- **방명록 보안 강화**: 자동화 봇 차단용 허니팟(Honeypot) 필드 도입, 본문 500자 상한 및 실시간 글자 카운터 UI 추가
- **원클릭 서버 실행기**: Windows cmd 한글 깨짐 방지(UTF-8 BOM) 및 대화형 모드 선택 런처(`run_server.bat`) 추가
- **Git 환경 정리**: `.gitignore`에 임시 스크래치(`scratch/`), 로그(`*.log`), 캐시 무시 패턴 추가

### `v1.0.0` (2026-09-15)
- **프로젝트 초기 구축**: FastAPI 백엔드 모듈화, SQLite 연동, ngrok 터널링 지원
- **핵심 페이지 구현**: 메인 홈페이지 대문, 실시간 방명록, 사진 업로드 갤러리(Pillow 가짜 이미지 방어)
