import io
import uuid
import shutil
from pathlib import Path
from datetime import datetime
from typing import Optional, List
from PIL import Image, UnidentifiedImageError
from pydantic import BaseModel
from fastapi import APIRouter, HTTPException, UploadFile, File, Form
from fastapi.responses import FileResponse
from database import TEMPLATES_DIR, UPLOADS_DIR, get_db

router = APIRouter(tags=["Photo"])

# 허용 파일 형식 및 MIME 타입
ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png"}
ALLOWED_MIME_TYPES = {"image/jpeg", "image/png"}


# Pydantic 모델 정의
class PhotoEntry(BaseModel):
    id: int
    filename: str
    original_name: str
    caption: Optional[str] = ""
    url: str
    created_at: str


# 1. 사진 갤러리 페이지 서빙
@router.get("/photo", summary="사진 업로드 및 갤러리 페이지")
async def serve_photo():
    return FileResponse(TEMPLATES_DIR / "photo.html")


# 2. 사진 목록 조회 API
@router.get("/api/photos", response_model=List[PhotoEntry], summary="사진 목록 조회")
async def get_photos():
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT id, filename, original_name, caption, created_at FROM photos ORDER BY id DESC")
        rows = cursor.fetchall()
        return [
            PhotoEntry(
                id=row["id"],
                filename=row["filename"],
                original_name=row["original_name"],
                caption=row["caption"] or "",
                url=f"/static/uploads/{row['filename']}",
                created_at=row["created_at"]
            )
            for row in rows
        ]


# 3. 사진 파일 업로드 API (Pillow 기반 가짜 파일 방어 및 코멘트 기능 적용)
@router.post("/api/photos", response_model=PhotoEntry, summary="사진 파일 업로드")
async def upload_photo(
    file: UploadFile = File(...),
    caption: Optional[str] = Form("")
):
    # 1) 파일 확장자 검증 (JPG, PNG)
    original_filename = file.filename or "image.jpg"
    ext = Path(original_filename).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail="허용되지 않는 파일 형식입니다. JPG, PNG 파일만 업로드할 수 있습니다."
        )

    # 2) Content-Type 헤더 검증
    if file.content_type and file.content_type not in ALLOWED_MIME_TYPES:
        raise HTTPException(
            status_code=400,
            detail="유효하지 않은 이미지 타입입니다. JPG, PNG 파일만 업로드할 수 있습니다."
        )

    # 3) 파일 바이트 읽기
    try:
        file_bytes = await file.read()
    except Exception as e:
        raise HTTPException(status_code=400, detail="파일을 읽는 중 오류가 발생했습니다.")
    finally:
        await file.close()

    # 4) [방어장치] Pillow를 통한 실제 이미지 디코딩 및 무결성 검증 (확장자 위장 파일 차단)
    try:
        image_stream = io.BytesIO(file_bytes)
        img = Image.open(image_stream)
        real_format = img.format  # 실제 이미지 포맷 (JPEG, PNG 등)
        img.verify()  # 이미지 데이터 손상 및 파싱 검증

        if real_format not in ["JPEG", "PNG"]:
            raise HTTPException(
                status_code=400,
                detail=f"실제 이미지 형식({real_format})이 허용된 형식(JPG/PNG)과 일치하지 않습니다."
            )
    except HTTPException:
        raise
    except (UnidentifiedImageError, Exception):
        raise HTTPException(
            status_code=400,
            detail="손상되었거나 확장자만 바꾼 가짜 이미지 파일입니다. 온전한 JPG 또는 PNG 이미지를 업로드해주세요."
        )

    # 5) 고유 파일명 생성 및 서버 스토리지 저장
    unique_filename = f"{uuid.uuid4().hex}{ext}"
    save_path = UPLOADS_DIR / unique_filename

    try:
        save_path.write_bytes(file_bytes)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"파일 저장 중 오류가 발생했습니다: {e}")

    created_at = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    clean_caption = (caption or "").strip()

    # 4) DB에 메타데이터 저장
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "INSERT INTO photos (filename, original_name, caption, created_at) VALUES (?, ?, ?, ?)",
            (unique_filename, original_filename, clean_caption, created_at)
        )
        conn.commit()
        new_id = cursor.lastrowid

    return PhotoEntry(
        id=new_id,
        filename=unique_filename,
        original_name=original_filename,
        caption=clean_caption,
        url=f"/static/uploads/{unique_filename}",
        created_at=created_at
    )

