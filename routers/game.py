from fastapi import APIRouter
from fastapi.responses import FileResponse
from database import TEMPLATES_DIR

router = APIRouter(tags=["Game"])


@router.get("/mandarin", summary="만다린 게임 페이지")
@router.get("/game", include_in_schema=False)
async def serve_game():
    return FileResponse(TEMPLATES_DIR / "game.html")

