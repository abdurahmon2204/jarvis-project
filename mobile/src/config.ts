/**
 * App configuration. You can edit this file, or generate it with:
 *   BACKEND_URL=https://your-backend.example.com npm run configure
 * (the GitHub Actions workflow does exactly that from repository secrets).
 */

// Public HTTPS address of your deployed backend, no trailing slash, no "/api".
export const BACKEND_URL = 'https://YOUR-BACKEND-URL';

// Must equal APP_KEY in backend/.env if you set one there. Leave empty otherwise.
export const APP_KEY = '';

// Languages the language button cycles through (2-letter codes). Jarvis answers in the language you speak;
// the first one is used on first launch. Say "Jarvis, speak Russian" to switch by voice.
export const LANGUAGES = ['en', 'ru', 'uz'];
export const DEFAULT_LANGUAGE = 'en';

// Offline wake-word model folder name (downloaded by `npm run model`, bundled into the APK).
export const VOSK_MODEL_NAME = 'model-en-en';

// Words that trigger the assistant. "jarvis" is the real one; the others are sound-alikes that the small
// offline model knows, which makes detection much more reliable. Remove any that cause false wake-ups.
export const WAKE_ALIASES = ['jarvis', 'jervis', 'travis', 'service'];
