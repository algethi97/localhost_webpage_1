from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, Field
from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from database import TEMPLATES_DIR, get_db

router = APIRouter(tags=["Guestbook"])


# Pydantic 모델 정의
class GuestbookEntry(BaseModel):
    id: int
    author: str
    content: str
    created_at: str


class GuestbookCreate(BaseModel):
    author: Optional[str] = "익명"
    content: str = Field(..., min_length=1)


# 1. 방명록 페이지 서빙
@router.get("/guestbook", summary="방명록 페이지")
async def serve_guestbook():
    return FileResponse(TEMPLATES_DIR / "guestbook.html")


# 2. 방명록 목록 조회 API
@router.get("/api/guestbook", response_model=List[GuestbookEntry], summary="방명록 목록 조회")
async def get_guestbook():
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT id, author, content, created_at FROM guestbook ORDER BY id DESC")
        rows = cursor.fetchall()
        return [
            GuestbookEntry(
                id=row["id"],
                author=row["author"],
                content=row["content"],
                created_at=row["created_at"]
            )
            for row in rows
        ]


# 3. 새 방명록 등록 API
@router.post("/api/guestbook", response_model=GuestbookEntry, summary="새 방명록 등록")
async def create_guestbook(data: GuestbookCreate):
    clean_content = data.content.strip()
    if not clean_content:
        raise HTTPException(status_code=400, detail="메시지 내용을 입력해주세요.")

    author = (data.author or "").strip() or "익명"
    created_at = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "INSERT INTO guestbook (author, content, created_at) VALUES (?, ?, ?)",
            (author, clean_content, created_at)
        )
        conn.commit()
        new_id = cursor.lastrowid

    return GuestbookEntry(
        id=new_id,
        author=author,
        content=clean_content,
        created_at=created_at
    )

