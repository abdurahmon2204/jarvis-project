// 2-letter language code <-> BCP-47 locale used by the Web Speech API.
const LOCALES = {
  en: "en-US", ru: "ru-RU", uz: "uz-UZ", tr: "tr-TR", de: "de-DE", fr: "fr-FR", es: "es-ES",
  it: "it-IT", ar: "ar-SA", kk: "kk-KZ", zh: "zh-CN", ja: "ja-JP", ko: "ko-KR", pt: "pt-PT",
};
export const LANGS = ["en", "ru", "uz"]; // languages offered by the language button
export const toLocale = (code) => LOCALES[String(code || "en").toLowerCase().slice(0, 2)] || code || "en-US";
export const toCode = (v) => String(v || "en").toLowerCase().slice(0, 2);
const KEY = "jarvis_lang";
export const loadLang = () => {
  try { return localStorage.getItem(KEY) || toCode(navigator.language); } catch { return "en"; }
};
export const saveLang = (c) => { try { localStorage.setItem(KEY, c); } catch { /* ignore */ } };
