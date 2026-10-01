@echo off
setlocal EnableDelayedExpansion

REM ============================================================
REM AIVORA RELEASE AUTOMATION
REM ============================================================

REM ---- Project configuration ----
set "APP_NAME=Aivora"
set "GITHUB_REPO=devnamdev2003/ai-desktop-assistant"

REM Change this if your latest.json is somewhere else
set "LATEST_JSON=latest.json"

REM Tauri config
set "TAURI_CONFIG=src-tauri\tauri.conf.json"

REM Signing key
set "SIGNING_KEY=%USERPROFILE%\.tauri\aivora.key"
set "SIGNING_PASSWORD=dev"

REM ============================================================
REM CHECK VERSION ARGUMENT
REM ============================================================

if "%~1"=="" (
    echo.
    echo ERROR: Version is required.
    echo.
    echo Usage:
    echo   release.bat 0.2.1
    echo.
    exit /b 1
)

set "VERSION=%~1"

echo.
echo ============================================================
echo              AIVORA RELEASE %VERSION%
echo ============================================================
echo.

REM ============================================================
REM CHECK REQUIRED FILES
REM ============================================================

if not exist "%TAURI_CONFIG%" (
    echo ERROR: %TAURI_CONFIG% not found.
    exit /b 1
)

if not exist "%SIGNING_KEY%" (
    echo ERROR: Signing key not found:
    echo %SIGNING_KEY%
    exit /b 1
)

if not exist "%LATEST_JSON%" (
    echo ERROR: %LATEST_JSON% not found.
    exit /b 1
)

echo [1/6] Updating Tauri version...
echo.

REM ============================================================
REM UPDATE TAURI VERSION
REM ============================================================

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
    "$path='%TAURI_CONFIG%';" ^
    "$json=Get-Content $path -Raw | ConvertFrom-Json;" ^
    "$json.version='%VERSION%';" ^
    "$json | ConvertTo-Json -Depth 100 | Set-Content $path -Encoding UTF8"

if errorlevel 1 (
    echo ERROR: Failed to update tauri.conf.json
    exit /b 1
)

echo Version updated to %VERSION%
echo.

REM ============================================================
REM SET TAURI SIGNING VARIABLES
REM ============================================================

echo [2/6] Setting signing environment variables...
echo.

set "TAURI_SIGNING_PRIVATE_KEY=%SIGNING_KEY%"
set "TAURI_SIGNING_PRIVATE_KEY_PASSWORD=%SIGNING_PASSWORD%"

echo Signing key:
echo %SIGNING_KEY%
echo.

REM ============================================================
REM BUILD TAURI APPLICATION
REM ============================================================

echo [3/6] Building Aivora...
echo.

call npx tauri build

if errorlevel 1 (
    echo.
    echo ERROR: Tauri build failed.
    exit /b 1
)

echo.
echo Tauri build completed successfully.
echo.

REM ============================================================
REM FIND SIGNATURE FILE
REM ============================================================

echo [4/6] Reading generated signature...
echo.

set "SIG_FILE=src-tauri\target\release\bundle\nsis\%APP_NAME%_%VERSION%_x64-setup.exe.sig"
set "EXE_FILE=src-tauri\target\release\bundle\nsis\%APP_NAME%_%VERSION%_x64-setup.exe"

if not exist "%SIG_FILE%" (
    echo ERROR: Signature file not found:
    echo %SIG_FILE%
    exit /b 1
)

if not exist "%EXE_FILE%" (
    echo ERROR: Installer not found:
    echo %EXE_FILE%
    exit /b 1
)

REM Read signature
set /p SIGNATURE=<"%SIG_FILE%"

echo Signature:
echo %SIGNATURE%
echo.

REM ============================================================
REM UPDATE latest.json
REM ============================================================

echo [5/6] Updating latest.json...
echo.

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
    "$path='%LATEST_JSON%';" ^
    "$json=Get-Content $path -Raw | ConvertFrom-Json;" ^
    "$json.version='%VERSION%';" ^
    "$json.platforms.'windows-x86_64'.signature='%SIGNATURE%';" ^
    "$json.platforms.'windows-x86_64'.url='https://github.com/%GITHUB_REPO%/releases/download/v%VERSION%/%APP_NAME%_%VERSION%_x64-setup.exe';" ^
    "$json | ConvertTo-Json -Depth 100 | Set-Content $path -Encoding UTF8"

if errorlevel 1 (
    echo ERROR: Failed to update latest.json
    exit /b 1
)

echo latest.json updated successfully.
echo.

REM ============================================================
REM SHOW RELEASE INFORMATION
REM ============================================================

echo [6/6] Release information
echo.
echo ============================================================
echo                  RELEASE READY
echo ============================================================
echo.
echo Version:
echo   %VERSION%
echo.
echo Installer:
echo   %EXE_FILE%
echo.
echo Signature:
echo   %SIG_FILE%
echo.
echo Latest JSON:
echo   %LATEST_JSON%
echo.
echo GitHub URL:
echo   https://github.com/%GITHUB_REPO%/releases/download/v%VERSION%/%APP_NAME%_%VERSION%_x64-setup.exe
echo.
echo ============================================================
echo.
echo NEXT STEP:
echo Upload the following files to GitHub Release v%VERSION%:
echo.
echo   1. %EXE_FILE%
echo   2. latest.json
echo.
echo ============================================================
echo.

pause