@echo off
REM setup.bat - Automated setup script for Windows

echo.
echo =========================================
echo UNI-POM Server Setup (Windows)
echo =========================================
echo.

REM Check Node.js
node --version > nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo Error: Node.js is not installed
    echo Please install Node.js 18+ from https://nodejs.org/
    pause
    exit /b 1
)

for /f "tokens=*" %%i in ('node --version') do set NODE_VERSION=%%i
echo Node.js version: %NODE_VERSION%
echo.

REM Install dependencies
echo Installing dependencies...
call npm install
if %ERRORLEVEL% NEQ 0 exit /b 1

echo.
echo Setting up Prisma...
call npm run prisma:generate
if %ERRORLEVEL% NEQ 0 exit /b 1

echo.
echo Creating .env file...
if exist .env (
    echo Warning: .env already exists, skipping
) else (
    copy .env.example .env
    echo .env created. Please edit it with your Supabase credentials
)

echo.
echo =========================================
echo Setup completed!
echo =========================================
echo.
echo Next steps:
echo 1. Edit .env with your Supabase DATABASE_URL
echo 2. Run: npm run prisma:push
echo 3. Run: npm run dev
echo.
echo API will be available at: http://localhost:5000
echo.
pause
