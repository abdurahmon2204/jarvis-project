@echo off
setlocal
cd /d "%~dp0"
echo ==== J.A.R.V.I.S. - birinchi sozlash ====
where node >nul 2>nul
if errorlevel 1 (
  echo [XATO] Node.js topilmadi. https://nodejs.org saytidan LTS versiyasini o'rnating, keyin qayta ishga tushiring.
  pause
  exit /b 1
)
node -e "process.exit(Number(process.versions.node.split('.')[0])>=20?0:1)"
if errorlevel 1 (
  echo [XATO] Node.js 20 yoki yuqori versiya kerak. Sizda:
  node -v
  pause
  exit /b 1
)
echo [1/3] Backend paketlari tekshirilmoqda...
pushd backend
call npm install --no-audit --no-fund
if errorlevel 1 (
  echo [XATO] npm install ishlamadi. Internetni tekshiring.
  pause
  exit /b 1
)
if not exist .env (
  copy /y .env.example .env >nul
  echo [2/3] backend\.env yaratildi. Hozir ochiladi: GROQ_API_KEY yoki GEMINI_API_KEY qatoriga kalitingizni yozing, saqlang va yoping.
  notepad .env
) else (
  echo [2/3] backend\.env allaqachon bor.
)
echo [3/3] Tekshiruv...
call npm run doctor
popd
echo.
echo Hammasi tayyor bo'lsa, start.bat ni ikki marta bosing.
pause
