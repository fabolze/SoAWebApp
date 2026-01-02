@echo off
setlocal

set "ROOT=%~dp0.."

set "PYTHON_EXE=%ROOT%\.venv\Scripts\python.exe"
if not exist "%PYTHON_EXE%" set "PYTHON_EXE=%ROOT%\venv\Scripts\python.exe"
if not exist "%PYTHON_EXE%" set "PYTHON_EXE=python"

start "SoA Backend" /d "%ROOT%" /b "%PYTHON_EXE%" app.py
cd /d "%ROOT%\soa-editor"
npm run dev
