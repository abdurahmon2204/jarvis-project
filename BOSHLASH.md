# J.A.R.V.I.S.: tez boshlash (Windows)

## 0. Nima bor va nima yo'q (nega "fayllar kam"dek tuyulishi mumkin)
ZIP ichida **hamma manba fayllari** bor (`npm run verify` buni tekshiradi). Quyidagilar ZIP'da **yo'q**, chunki ular sizning
kompyuteringizda yoki bulutda avtomatik yaratiladi:

| Nima | Nega yo'q | Qanday paydo bo'ladi |
|---|---|---|
| `mobile/node_modules` (yuzlab MB) | juda katta, har tizim uchun alohida | GitHub'da APK yig'ilganda avtomatik o'rnatiladi |
| `web/node_modules` | faqat veb kodni tahrirlash uchun kerak | `cd web && npm install` (tayyor `web/dist` allaqachon ichida) |
| `backend/.env` | bu yerda **maxfiy kalitlaringiz** turadi | `setup.bat` yaratadi |
| ovoz modeli (40 MB) | internetdan yuklanadi | `npm run model` yoki GitHub yig'ishda avtomatik |

`backend/node_modules` esa tayyor holda ichida, shuning uchun backend darhol ishlaydi.

## 1. Kompyuterda ishga tushirish (5 daqiqa)
1. ZIP'ni to'liq oching (masalan `C:\jarvis-complete`). Yo'l qisqa va bo'shliqsiz bo'lsin.
2. Node.js **20 yoki yuqori** o'rnating: https://nodejs.org (LTS).
3. **`setup.bat`** ni ikki marta bosing. Notepad ochiladi: quyidagilardan kamida bittasini yozing va saqlang:
   - `GROQ_API_KEY=...` (https://console.groq.com/keys, bepul)
   - `GEMINI_API_KEY=...` (https://aistudio.google.com/apikey, bepul)
4. Oxirida tekshiruv (doctor) chiqadi. Hamma qator ✅ bo'lsin. MongoDB yo'q bo'lsa ham chat ishlaydi (faqat xotira va eslatmalar o'chiq turadi).
5. **`start.bat`** ni ikki marta bosing. Brauzerda `http://localhost:5000` ochiladi, INITIALIZE ni bosing, mikrofonga ruxsat bering va "Hey Jarvis, what time is it?" deng.

## 2. Telefon uchun APK
`README.md` dagi 2 va 3-bo'limlarga qarang: MongoDB Atlas, Render (backend), GitHub Actions (APK yig'ish). Qisqasi:
1. Atlas'da bepul baza yarating, ulanish satrini oling.
2. Render'da `render.yaml` orqali backend'ni joylang. Manzil: `https://...onrender.com`.
3. GitHub'ga yuklang, **Settings > Secrets > Actions** da `BACKEND_URL` ni kiriting.
4. **Actions > Build Android APK > Run workflow**. Tugagach `JARVIS.apk` ni yuklab oling.

## 3. Muammo bo'lsa
- `npm run verify` (loyiha papkasida): qaysi fayl yetishmasligini aytadi.
- `cd backend` va `npm run doctor`: kalitlar, modellar, ob-havo va bazani tekshiradi.
- Xato matnini yuboring, tuzataman.
