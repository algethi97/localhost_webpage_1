from fastapi import APIRouter
from fastapi.responses import FileResponse
from database import TEMPLATES_DIR

router = APIRouter(tags=["Home"])


@router.get("/", summary="메인 홈페이지 대문")
async def serve_home():
    return FileResponse(TEMPLATES_DIR / "index.html")

