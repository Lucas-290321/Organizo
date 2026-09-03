@echo off
setlocal

cd /d "%~dp0"

set "APP_PORT=8765"
set "APP_URL=http://127.0.0.1:%APP_PORT%"
set "CHECK_URL=http://127.0.0.1:%APP_PORT%/"
set "PYTHON_CMD="

where py >nul 2>nul
if %errorlevel%==0 set "PYTHON_CMD=py"

if not defined PYTHON_CMD (
  where python >nul 2>nul
  if %errorlevel%==0 set "PYTHON_CMD=python"
)

if not defined PYTHON_CMD (
  echo Python nao foi encontrado neste PC.
  echo Instale o Python 3 e tente novamente.
  pause
  exit /b 1
)

start "Organiza APP - Servidor" cmd /k "set PORT=%APP_PORT% && %PYTHON_CMD% backend\run.py"

echo Aguardando o servidor iniciar...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$deadline=(Get-Date).AddSeconds(20); do { try { $response = Invoke-WebRequest -Uri '%CHECK_URL%' -UseBasicParsing -TimeoutSec 2; if ($response.StatusCode -ge 200) { Start-Process '%APP_URL%'; exit 0 } } catch { Start-Sleep -Milliseconds 700 } } while ((Get-Date) -lt $deadline); Write-Host 'O servidor nao respondeu a tempo. Abra manualmente:'; Write-Host '%APP_URL%'"
