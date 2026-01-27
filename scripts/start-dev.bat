@echo off
setlocal

set "ROOT=%~dp0.."

start "SoA Backend" cmd /k "cd /d "%ROOT%" && py -3 app.py"
start "SoA Frontend" cmd /k "cd /d "%ROOT%\soa-editor" && npm run dev"
