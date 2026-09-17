import io
import uuid
import shutil
from pathlib import Path
from datetime import datetime
from typing import Optional, List
from PIL import Image, ImageOps, UnidentifiedImageError
from pydantic import BaseModel
from fastapi import APIRouter, HTTPException, UploadFile, File, Form
from fastapi.responses import FileResponse
from database import TEMPLATES_DIR, UPLOADS_DIR, get_db

router = APIRouter(tags=["Photo"])

# 허용 파일 형식 및 크기 제한 (최대 30MB)
ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png"}
ALLOWED_MIME_TYPES = {"image/jpeg", "image/png"}
MAX_FILE_SIZE = 30 * 1024 * 1024  # 30MB
MAX_DIMENSION = 2048  # 긴 축 기준 최대 2048px (FHD/QHD 최적화)


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


# 3. 사진 파일 업로드 API (30MB 제한, EXIF GPS 제거, 가짜 확장자 차단, 웹 최적화 리사이징)
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

    # 3) 파일 크기 선행 검사 (file.size 제공 시)
    if file.size and file.size > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=413,
            detail="파일 크기가 너무 큽니다. 최대 30MB 이하의 이미지만 업로드할 수 있습니다."
        )

    # 4) 스트림 읽기 시 최대 30MB 제한 적용 (메모리 고갈 DoS 방어)
    try:
        file_bytes = await file.read(MAX_FILE_SIZE + 1)
    except Exception:
        raise HTTPException(status_code=400, detail="파일을 읽는 중 오류가 발생했습니다.")
    finally:
        await file.close()

    if len(file_bytes) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=413,
            detail="파일 크기가 너무 큽니다. 최대 30MB 이하의 이미지만 업로드할 수 있습니다."
        )

    # 5) Pillow 무결성 검증 (확장자 위장 파일 차단)
    try:
        image_stream = io.BytesIO(file_bytes)
        img = Image.open(image_stream)
        real_format = img.format  # 실제 이미지 포맷 (JPEG, PNG 등)
        img.verify()  # 데이터 무결성 검증

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

    # 6) 고유 파일명 생성
    saved_ext = ".jpg" if real_format == "JPEG" else ".png"
    unique_filename = f"{uuid.uuid4().hex}{saved_ext}"
    save_path = UPLOADS_DIR / unique_filename

    # 7) 개인정보(EXIF GPS) 제거 + 스마트폰 회전각 보정 + 웹 최적화 리사이징
    try:
        image_stream.seek(0)
        proc_img = Image.open(image_stream)

        # 스마트폰 촬영 회전 태그 자동 보정
        try:
            proc_img = ImageOps.exif_transpose(proc_img)
        except Exception:
            pass

        # 모드 호환성 보장 (JPEG는 RGB, PNG는 RGBA/RGB)
        if real_format == "JPEG" and proc_img.mode in ("RGBA", "P"):
            proc_img = proc_img.convert("RGB")
        elif real_format == "PNG" and proc_img.mode not in ("RGB", "RGBA"):
            proc_img = proc_img.convert("RGBA")

        # 웹 최적화 리사이징 (긴 축 기준 2048px 초과 시 비율 유지 축소)
        if max(proc_img.width, proc_img.height) > MAX_DIMENSION:
            proc_img.thumbnail((MAX_DIMENSION, MAX_DIMENSION), Image.Resampling.LANCZOS)

        # EXIF(GPS 좌표, 카메라 정보 등)를 배제하고 순수 픽셀 데이터만 고품질 압축 저장
        if real_format == "JPEG":
            proc_img.save(save_path, format="JPEG", quality=88, optimize=True)
        else:
            proc_img.save(save_path, format="PNG", optimize=True)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"이미지 최적화 저장 중 오류가 발생했습니다: {e}")

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

