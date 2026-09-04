@echo off
echo Building ESP for distribution...
echo.

if not exist "node_modules\" (
    echo Installing dependencies...
    call npm install
    echo.
)

call npm run dist
echo.
echo Build finished — installer is in the dist folder.
pause