@echo off
cd /d "%~dp0backend"
if not exist .env (
  echo backend\.env topilmadi. Avval setup.bat ni ishga tushiring.
  pause
  exit /b 1
)
echo J.A.R.V.I.S. ishga tushmoqda... brauzer 4 soniyadan keyin ochiladi (http://localhost:5000)
start "" cmd /c "timeout /t 4 >nul & start http://localhost:5000"
node server.js
pause
