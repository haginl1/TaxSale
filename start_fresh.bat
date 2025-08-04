@echo off
echo === STARTING FRESH TAX SALE SERVER ===

echo Killing any existing Node processes...
taskkill /f /im node.exe >nul 2>&1

echo Waiting 2 seconds...
timeout /t 2 /nobreak >nul

echo Starting server with enhanced logging...
node server.js

pause
