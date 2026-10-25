# J.A.R.V.I.S. Voice Assistant (v3)

```
jarvis-complete/
├── backend/   Node + Express + MongoDB. LLM agent with tools (weather, search, memory, notes, phone actions)
├── web/       React web client ("Hey Jarvis" in the browser)
├── mobile/    React Native 0.88 Android app: offline wake word, background service, controls the phone
├── render.yaml, backend/Dockerfile      cloud deployment
└── .github/workflows/                   builds the APK in the cloud, runs backend tests
```

> **Quick start on Windows:** read `BOSHLASH.md` (Uzbek), run `setup.bat`, then `start.bat`.
> Run `npm run verify` to confirm that every file is present. `node_modules` of the web and mobile parts are not shipped
> (they are created by `npm install` / the GitHub build); the backend's are included and the built web app is in `web/dist`.

## What Jarvis can do

| Area | Examples (say "Jarvis, ...") | Works on |
|---|---|---|
| **Time & phone control** | "what time is it", "set a timer for 10 minutes", "wake me at 7:30", "remind me tomorrow at 9 to call mom", "what alarms do I have", "cancel the pasta timer" | phone (time also on web) |
| | "call Alisher", "text Dilnoza I'll be late", "send a WhatsApp message to ...", "open Telegram", "navigate to Amir Temur Square", "play Queen on YouTube" | phone |
| **Weather & internet** | "weather in Tashkent", "what's the weather tomorrow" (uses your saved city), "who won the match yesterday", "what is the dollar rate" | phone + web |
| **Notes & memory** | "add milk to my notes", "read my notes", "delete note two", "remember that I live in Tashkent", "forget everything about me" | phone + web |
| **Languages** | Answers in the language you speak (English, Russian, Uzbek, ...). "Jarvis, speak Russian" switches listening and speaking. The 🌐 button in the app cycles languages. | phone + web |

How it works: the model decides which **tool** to use; the backend runs data tools (weather, search, memory, notes) and
returns phone actions (timers, calls, apps) for the app to execute. Anything that reaches your phone is validated first,
and the assistant only confirms what was really queued.

## 1. Run it locally

```bash
npm run install:all
cd backend
cp .env.example .env          # set GROQ_API_KEY and/or GEMINI_API_KEY (+ MONGODB_URI)
npm run doctor                # every line should be ✅ (it tests keys, models, weather, tool use and the database)
npm run dev
```
Free keys: Groq https://console.groq.com/keys, Gemini https://aistudio.google.com/apikey.
One provider is enough; a second one is an automatic backup. For real web search (news, prices) add a free
`TAVILY_API_KEY` from tavily.com; without it the assistant can only look things up on Wikipedia.

Web client: `cd web && cp .env.example .env && npm run dev` (Chrome/Edge).
Automated tests: `npm test` (backend: LLM fallback, agent loop, tools, time handling, prompt-injection guard, API).

## 2. Deploy the backend (needed for a public APK)

1. **Database:** free MongoDB Atlas cluster; copy the connection string (`mongodb+srv://...`) and allow access from anywhere (0.0.0.0/0).
2. **Host:** Render (`render.yaml`: New → Blueprint; add `plan: free` under `runtime: node` if you want the free tier) or any Docker host.
3. **Environment variables:** `MONGODB_URI`, `GROQ_API_KEY` and/or `GEMINI_API_KEY`, `JWT_SECRET`
   (`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`), optional `TAVILY_API_KEY`, `APP_KEY`.
4. Open `https://YOUR-BACKEND/api/health`: it must show `"status":"online"`.

Free hosting tiers may sleep when idle; the first request after a pause can take about a minute (the app waits up to 45 s).

## 3. Build the APK

### Option A: GitHub Actions (no Android Studio)
1. Push this folder to a GitHub repository.
2. Settings → Secrets and variables → Actions:
   - Secret `BACKEND_URL` = `https://YOUR-BACKEND` (required), secret `APP_KEY` (optional, same as backend)
   - Variables (optional): `DEFAULT_LANGUAGE` (e.g. `uz`), `LANGUAGES` (e.g. `uz,ru,en`)
   - Signing (recommended): secrets `KEYSTORE_BASE64`, `KEYSTORE_PASSWORD`, `KEY_ALIAS`, `KEY_PASSWORD`
3. Actions → "Build Android APK" → Run workflow → download `JARVIS.apk` from the artifacts.
   A pushed tag like `v1.0.0` also creates a GitHub Release with the APK.

### Option B: your own computer (Android SDK + JDK 17)
```bash
cd mobile
npm install
BACKEND_URL=https://YOUR-BACKEND npm run configure     # Windows cmd: set BACKEND_URL=... then npm run configure
npm run model                                          # downloads the ~40 MB offline wake-word model
cd android && ./gradlew assembleRelease                # Windows: gradlew assembleRelease
```
Result: `mobile/android/app/build/outputs/apk/release/app-release.apk`.
Local development against your PC over HTTP (debug build): `ALLOW_HTTP=1 BACKEND_URL=http://192.168.1.23:5000 npm run configure && npm run android`.

Signing key (create once, keep forever):
`keytool -genkeypair -v -storetype PKCS12 -keystore jarvis.keystore -alias jarvis -keyalg RSA -keysize 2048 -validity 10000`
For GitHub, base64 it: Linux/macOS `base64 -w0 jarvis.keystore`, PowerShell `[Convert]::ToBase64String([IO.File]::ReadAllBytes("jarvis.keystore"))`.

## 4. Install and first launch
Send `JARVIS.apk` to the phone (allow "install unknown apps"), then:
1. Allow microphone and notifications; wait while the offline voice model unpacks (first launch only).
2. Allow **exact alarms** if Android asks (otherwise timers can be late) and **contacts** the first time you call or text by name.
3. Set the app to "Unrestricted / Don't optimize" in battery settings (amber banner in the app helps).
4. Say **"Jarvis"**, then your request. Or tap the orb, or the **Speak** button in the notification (works on the lock screen).

## 5. Things you should know

- **Timers, alarms and reminders** are scheduled notifications owned by Jarvis (they are not in the system Clock app). They ring
  while the phone is locked or the app is closed, and survive a reboot. Say "what alarms do I have" to list them.
- **Calls, SMS, WhatsApp, apps, maps, music** open the right app; you still press call / send. Android 10+ blocks opening apps from
  the background, so when Jarvis is not on screen it posts a **"Tap to ..."** notification and runs the action when you tap it.
- **Listening language:** Android's recognizer works in one language at a time, so Jarvis keeps the last language you used.
  It follows the language of its answers, and you can switch by voice ("speak Russian") or with the 🌐 button. Speak the new language
  after switching; the first sentence in a new language may be misheard.
- **Voices:** the reply is read with an installed text-to-speech voice for that language. If one is missing (Uzbek is often not
  installed), the text is shown with a hint to add the voice in Android Settings → Text-to-speech.
- **Safety:** web search results are treated as untrusted. After the assistant has read web content in a turn, it is not allowed to call,
  message, open apps or links in that same turn. Passwords, card numbers and similar secrets are never stored in memory.
- **Privacy:** wake word runs on the device. After it, your command is transcribed by Android's recognizer (Google), the text goes to
  your backend and the LLM provider you chose, and weather/search lookups go to Open-Meteo, Wikipedia or Tavily. Conversations expire after
  90 days; `DELETE /api/me` removes chats, saved facts and notes of a device. "Forget everything about me" clears saved facts.
- **Not verified on a real phone by the author.** Verified here: backend (agent, tools, API: automated tests with mocked services), web build,
  TypeScript + JS bundle of the app, contact-name matching. **Not** verified: the Android (Gradle/Kotlin) build, live calls to Open-Meteo/Wikipedia/Tavily
  (my environment cannot reach them), and real phone behavior (background listening, alarms, calls). `npm run doctor` checks the live services from your machine.
- **Wake word:** Vosk is free and offline but less precise than paid engines. Tune `WAKE_ALIASES` in `mobile/src/config.ts`.
- **Android 14+:** open the app once after a reboot so the microphone service can start.
- **Google Play:** needs a developer account, privacy policy, the foreground-service (microphone) declaration, and Play restricts the
  exact-alarm permission to alarm/clock apps. Sideloading the APK works without any of that.

## 6. Configuration

| Setting | Where |
|---|---|
| Keys, providers, limits, pinned models | `backend/.env` (see `.env.example`) |
| Personality, tool rules | `backend/services/agent/prompt.js` |
| Add a new tool | `backend/services/agent/tools/` (register it in `tools/index.js`) |
| App backend URL, app key, languages, wake aliases | `mobile/src/config.ts` or `npm run configure` |
| Web API URL / app key | `web/.env` |
| Timings (silence, hand-off) | constants at the top of `mobile/App.tsx` |

## 7. Troubleshooting
- Anything odd with answers or tools: `cd backend && npm run doctor`.
- `/api/health` says `degraded`: the database or every LLM provider is failing; the `llm` list shows which.
- The assistant talks about doing something but nothing happens on the phone: check the red banner in the app and that the permission
  (contacts, exact alarms, notifications) is granted.
- "Backend URL is not set": run `npm run configure`. "Cannot start the wake-word engine": run `npm run model` and rebuild.
