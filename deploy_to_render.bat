@echo off
echo ====================================
echo GIT DEPLOYMENT COMMANDS
echo Updated: August 4, 2025
echo ====================================
echo.

echo Running: git status
git status
echo.

echo Running: git add .
git add .
echo.

echo Running: git commit
git commit -m "Deploy: Add dynamic URL fetching for current tax sale data - Implement dynamic URL scraping from tax.chathamcountyga.gov/TaxSaleList - Replace hardcoded URLs with live URL detection - Add extensive debug logging for troubleshooting - Expected: ~30 properties (Aug 2025) instead of 170 (cached) - Current PDF ID: bbcf4bac-48f3-47fe-894c-18397e65ebff"
echo.

echo Running: git push origin main
git push origin main
echo.

echo ====================================
echo DEPLOYMENT COMPLETED
echo ====================================
echo.
echo Next steps:
echo 1. Check Render dashboard for deployment
echo 2. Monitor deployment logs  
echo 3. Test API: your-app.onrender.com/api/tax-sale-listings/chatham?forceRefresh=true
echo 4. Should return ~30 properties instead of 170
echo 5. New PDF links section should be visible in web interface
echo.

pause
