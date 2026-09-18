@echo off
cd /d "%~dp0.."
start "Servidor de pedidos Dropi" cmd /c "call npx.cmd tsx scripts\actualizar-pedidos-servidor.ts"
timeout /t 3 /nobreak >nul
start "" http://localhost:4321