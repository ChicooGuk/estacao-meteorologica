@echo off
setlocal DisableDelayedExpansion
title Estacao - Backend
echo Iniciando o backend da estacao...
cd /d "%~dp0"
if errorlevel 1 goto erro_diretorio
set "ESTACAO_PYTHON="
if exist ".venv314\Scripts\python.exe" set "ESTACAO_PYTHON=%CD%\.venv314\Scripts\python.exe"
if not defined ESTACAO_PYTHON if exist ".venv\Scripts\python.exe" set "ESTACAO_PYTHON=%CD%\.venv\Scripts\python.exe"
if not defined ESTACAO_PYTHON goto erro_python
if not exist "backend\.env" goto erro_config

echo Verificando as dependencias do Python...
"%ESTACAO_PYTHON%" -u -c "import uvicorn, fastapi, paho.mqtt.client, mysql.connector, dotenv"
if errorlevel 1 goto erro_dependencias

echo.
echo Abrindo API em http://localhost:8000
echo Deixe esta janela aberta. Para encerrar: Ctrl+C.
echo MySQL e Mosquitto devem estar iniciados pelo iniciar_servicos.bat.
echo.
"%ESTACAO_PYTHON%" -u -m uvicorn python:app --app-dir backend --env-file backend\.env --host 0.0.0.0 --port 8000 --log-level info
if errorlevel 1 goto erro_backend
endlocal
exit /b 0

:erro_diretorio
echo ERRO: nao foi possivel abrir a pasta do projeto.
goto falha
:erro_python
echo ERRO: ambiente Python ausente. Crie .venv314 e instale backend\requirements.txt.
goto falha
:erro_config
echo ERRO: falta backend\.env. Copie backend\.env.example e configure os dados locais.
goto falha
:erro_dependencias
echo ERRO: nao foi possivel carregar as dependencias. Confira a mensagem acima.
echo Instale com: "%ESTACAO_PYTHON%" -m pip install -r backend\requirements.txt
goto falha
:erro_backend
echo.
echo ERRO: o backend encerrou com falha. Confira as mensagens acima.
echo Verifique MySQL, Mosquitto, backend\.env e se a porta 8000 ja esta ocupada.
:falha
echo.
pause
endlocal
exit /b 1
