@echo off
echo ====================================
echo TAX SALE SYSTEM - FRESH START
echo ====================================
echo.

echo Killing any existing Node processes...
taskkill /F /IM node.exe 2>nul
timeout /t 2 >nul

echo.
echo Testing URL fetching...
node simple_url_test.js

echo.
echo Starting server with debug output...
echo Press Ctrl+C to stop the server
echo.
node server.js

pause
