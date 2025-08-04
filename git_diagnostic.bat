@echo off
echo ====================================
echo GIT DIAGNOSTIC SCRIPT
echo ====================================
echo.

echo Current directory:
cd
echo.

echo Git version:
git --version
echo.

echo Git configuration:
echo User name: 
git config --global user.name
echo User email:
git config --global user.email
echo.

echo Repository status:
git status
echo.

echo Remote repositories:
git remote -v
echo.

echo Recent commits:
git log --oneline -3
echo.

echo Current branch:
git branch
echo.

echo Testing connection to GitHub:
git ls-remote origin
echo.

echo ====================================
echo DIAGNOSTIC COMPLETE
echo.
echo If you see authentication errors above,
echo you need to set up a Personal Access Token:
echo 1. Go to GitHub.com → Settings → Developer settings → Personal access tokens
echo 2. Generate new token with 'repo' permissions
echo 3. Use it as password when git prompts for credentials
echo ====================================
pause
