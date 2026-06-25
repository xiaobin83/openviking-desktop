@echo off
REM Reset first-run state for testing the onboarding wizard.
REM
REM Usage:
REM   reset-first-run.bat                 Reset flags + config only
REM   reset-first-run.bat --full          Also delete Python venv
REM   reset-first-run.bat --purge         Alias for --full
REM   reset-first-run.bat --help          Show this help

setlocal enabledelayedexpansion

REM Legacy flag/config locations (before Tauri app_data_dir migration)
set ONBOARDED_FLAG_LEGACY=%USERPROFILE%\.openviking\.onboarded
set OV_CONF_LEGACY=%USERPROFILE%\.openviking\ov.conf

REM app data dir per Tauri conventions (bundle id com.openviking.desktop)
set APPDATA_DIR=%APPDATA%\com.openviking.desktop
set ONBOARDED_FLAG=%APPDATA_DIR%\.onboarded
set OV_CONF=%APPDATA_DIR%\ov.conf
set VENV_DIR=%APPDATA_DIR%\python
set UV_PYTHON_DIR=%APPDATA%\uv\data\python

set MODE=reset

if /I "%1"=="--help" goto :show_help
if /I "%1"=="-h" goto :show_help
if /I "%1"=="--full" set MODE=full
if /I "%1"=="--purge" set MODE=full

echo Resetting first-run state...
echo.

REM --- always: remove flag and config ---

set REMOVED_FLAG=0
for %%F in ("%ONBOARDED_FLAG%" "%ONBOARDED_FLAG_LEGACY%") do (
    if exist %%F (
        del %%F
        echo   [OK] Removed %%F
        set REMOVED_FLAG=1
    )
)
if %REMOVED_FLAG%==0 (
    echo   - .onboarded flag [not found in app data or legacy location]
)

REM Remove ov.conf from app data dir
if exist "%OV_CONF%" (
    del "%OV_CONF%"
    echo   [OK] Removed %OV_CONF%
    if exist "%OV_CONF%.bak" (
        del "%OV_CONF%.bak"
        echo   [OK] Removed %OV_CONF%.bak
    )
) else (
    echo   - %OV_CONF% [not found]
)

REM Also clean up legacy ov.conf location
if exist "%OV_CONF_LEGACY%" (
    del "%OV_CONF_LEGACY%"
    echo   [OK] Removed %OV_CONF_LEGACY%
    if exist "%OV_CONF_LEGACY%.bak" (
        del "%OV_CONF_LEGACY%.bak"
        echo   [OK] Removed %OV_CONF_LEGACY%.bak
    )
)

REM --- full/purge: delete venv and uv-downloaded Python binaries ---

if "%MODE%"=="full" (
    echo.
    echo --- Removing Python environment ---

    if exist "%VENV_DIR%" (
        rmdir /S /Q "%VENV_DIR%"
        echo   [OK] Removed Python venv: %VENV_DIR%
    ) else (
        echo   - Python venv [not found]: %VENV_DIR%
    )

    if exist "%UV_PYTHON_DIR%" (
        rmdir /S /Q "%UV_PYTHON_DIR%"
        echo   [OK] Removed downloaded Python binaries: %UV_PYTHON_DIR%
    ) else (
        echo   - Downloaded Python binaries [not found]: %UV_PYTHON_DIR%
    )
)

echo.
echo Done. Next app launch will show the onboarding wizard.
goto :eof

:show_help
echo Reset first-run state for testing the onboarding wizard.
echo.
echo Usage: %~nx0 [OPTION]
echo.
echo Options:
echo   --full    Delete Python venv and downloaded Python binaries
echo   --purge   (same as --full)
echo   --help    Show this help and exit
echo.
echo Without options, only removes the .onboarded flag and ov.conf.
goto :eof
