import sqlite3
from pathlib import Path

# 기본 디렉토리 경로 설정
BASE_DIR = Path(__file__).resolve().parent
TEMPLATES_DIR = BASE_DIR / "templates"
STATIC_DIR = BASE_DIR / "static"
UPLOADS_DIR = STATIC_DIR / "uploads"
DATA_DIR = BASE_DIR / "data"
DB_PATH = DATA_DIR / "guestbook.db"

# 필수 디렉토리 생성
STATIC_DIR.mkdir(exist_ok=True)
(STATIC_DIR / "css").mkdir(exist_ok=True)
(STATIC_DIR / "js").mkdir(exist_ok=True)
UPLOADS_DIR.mkdir(exist_ok=True)
DATA_DIR.mkdir(exist_ok=True)


def init_db():
    """SQLite 데이터베이스 테이블 초기화 (방명록 및 사진 갤러리)"""
    with sqlite3.connect(DB_PATH) as conn:
        cursor = conn.cursor()
        # 1. 방명록 테이블
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS guestbook (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                author TEXT NOT NULL,
                content TEXT NOT NULL,
                created_at TEXT NOT NULL
            )
        """)
        # 2. 사진 갤러리 테이블
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS photos (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                filename TEXT NOT NULL,
                original_name TEXT NOT NULL,
                caption TEXT DEFAULT '',
                created_at TEXT NOT NULL
            )
        """)

        # 기존 DB 호환을 위한 caption 컬럼 자동 추가 (마이그레이션)
        cursor.execute("PRAGMA table_info(photos)")
        columns = [col[1] for col in cursor.fetchall()]
        if "caption" not in columns:
            cursor.execute("ALTER TABLE photos ADD COLUMN caption TEXT DEFAULT ''")

        conn.commit()


def get_db():
    """SQLite 데이터베이스 연결 반환 (Row factory 적용)"""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

