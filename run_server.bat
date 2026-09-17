@echo off
chcp 65001 > nul
title NaJakHome 웹 서버 실행기
cd /d "%~dp0"

echo ======================================================
echo    NaJakHome 웹 서버 원클릭 실행기
echo ======================================================
echo.
echo  [1] 로컬 디버그 모드 (http://127.0.0.1:8000) [기본값]
echo  [2] 외부 공개 모드 (ngrok 터널링 활성화)
echo.
echo ======================================================
set "MODE=1"
set /p "MODE=실행할 모드를 선택하세요 (1 또는 2, 엔터 시 1번): "

if "%MODE%"=="2" (
    echo.
    echo [외부 공개 모드] ngrok 터널링 서버를 시작합니다...
    echo.
    uv run python main.py
) else (
    echo.
    echo [로컬 디버그 모드] 로컬 웹 서버를 시작합니다...
    echo 브라우저 접속 주소: http://127.0.0.1:8000
    echo.
    uv run python main.py --local
)

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo 서버 실행 중 오류가 발생했습니다. (종료 코드: %ERRORLEVEL%)
)

echo.
echo 서버가 종료되었습니다.
pause
