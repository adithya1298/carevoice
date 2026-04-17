@echo off
title CareVoice - AI Speech Therapy Startup
echo ====================================================
echo   CareVoice - Professional One-Click Startup
echo ====================================================
echo.

:: Check for Bun or NPM
where bun >nul 2>nul
if %ERRORLEVEL% equ 0 (
    set PKG_MGR=bun
) else (
    set PKG_MGR=npm
)

echo [1/4] Checking for Node.js Environment...
where node >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo.
    echo [ERROR] Node.js is NOT installed or not in your PATH.
    echo Please install Node.js from https://nodejs.org
    pause
    exit /b
)

:: Check for Bun or NPM
where bun >nul 2>nul
if %ERRORLEVEL% equ 0 (
    set PKG_MGR=bun
) else (
    set PKG_MGR=npm
)

echo [2/4] Using package manager: %PKG_MGR%

:: Install Dependencies if node_modules is missing
if not exist "node_modules\" (
    echo [3/4] node_modules not found. Installing dependencies...
    if "%PKG_MGR%"=="bun" (
        call bun install
    ) else (
        call npm install
    )
) else (
    echo [3/4] node_modules found. Skipping installation.
)

echo [4/4] Starting development server...
echo.
echo ====================================================
echo   THE BROWSER SHOULD OPEN AUTOMATICALLY.
echo   If it doesn't, press CTRL and CLICK this link:
echo   http://localhost:8080
echo ====================================================
echo.
echo   (To stop the server, just close this window)
echo.

if "%PKG_MGR%"=="bun" (
    bun dev
) else (
    npm run dev
)

pause
