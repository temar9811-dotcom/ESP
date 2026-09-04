@echo off
echo Starting ESP in development mode...
echo.

if not exist "node_modules\" (
    echo Installing dependencies...
    call npm install
    echo.
)

call npm start
pause