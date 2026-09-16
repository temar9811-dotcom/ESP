@echo off
echo =========================================
echo   ESP Project Builder
echo =========================================
echo.

echo [1/3] Installing dependencies...
call npm install
if %errorlevel% neq 0 (
    echo ERROR: npm install failed.
    pause
    exit /b %errorlevel%
)

echo.
echo [2/3] Building React UI with Vite...
call npm run build:ui
if %errorlevel% neq 0 (
    echo ERROR: UI build failed. Check vite logs.
    pause
    exit /b %errorlevel%
)

echo.
echo [3/3] Packaging with electron-builder...
call npx electron-builder --win
if %errorlevel% neq 0 (
    echo ERROR: Packaging failed.
    pause
    exit /b %errorlevel%
)

echo.
echo =========================================
echo   Build completed successfully!
echo   Check the 'dist' folder for the installer.
echo =========================================
pause