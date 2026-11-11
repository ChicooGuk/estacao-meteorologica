@echo off
setlocal DisableDelayedExpansion
cd /d "%~dp0"
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0backend\iniciar_cloudflare.ps1" -Encerrar
echo.
pause
endlocal
