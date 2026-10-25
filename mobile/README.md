# J.A.R.V.I.S. Mobile (React Native CLI, Android)

See the root README.md for the full guide. Quick reference:

- Settings: `src/config.ts` (backend URL, app key, languages, wake-word aliases) or `npm run configure`.
- Offline wake-word model: `npm run model` (downloads ~40 MB into `assets/model-en-en`).
- `index.js` registers the Notifee foreground service and the notification buttons (Speak, Pause, Dismiss, "Tap to ...").
- `App.tsx`: `JarvisEngine` singleton (Vosk wake word, Android speech recognizer, backend call, TTS) and the UI.
- `src/deviceActions.ts`: timers/alarms/reminders (scheduled notifications) and calls, messages, apps, maps, music.
- `src/contacts.ts` + `src/nameMatch.ts`: contact lookup with Cyrillic/Latin name matching.
- `android/.../JarvisDeviceModule.kt`: wake-lock and "open app by name" helpers.
- Debug on a connected phone: `npm install && npm run android`.
