@echo off
echo Deploying Campus Lost & Found Platform to Firebase...
echo.

REM Check if Firebase CLI is installed
firebase --version >nul 2>&1
if %errorlevel% neq 0 (
    echo Firebase CLI is not installed. Please install it first:
    echo npm install -g firebase-tools
    pause
    exit /b 1
)

REM Check if user is logged in
firebase projects:list >nul 2>&1
if %errorlevel% neq 0 (
    echo Please login to Firebase first:
    echo firebase login
    pause
    exit /b 1
)

REM Deploy to Firebase
echo Deploying to Firebase...
firebase deploy

if %errorlevel% equ 0 (
    echo.
    echo ✅ Deployment successful!
    echo Your app is now live on Firebase Hosting.
) else (
    echo.
    echo ❌ Deployment failed. Please check the error messages above.
)

pause




