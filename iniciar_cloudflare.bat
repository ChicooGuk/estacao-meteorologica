@echo off
setlocal DisableDelayedExpansion
title Estacao - Cloudflare e publicacao
cd /d "%~dp0"
echo Verificando API, Cloudflare e Firebase...
echo MySQL, Mosquitto e iniciar_backend.bat devem estar em funcionamento.
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0backend\iniciar_cloudflare.ps1"
echo.
pause
endlocal
