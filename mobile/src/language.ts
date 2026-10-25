import AsyncStorage from '@react-native-async-storage/async-storage';
import { DEFAULT_LANGUAGE, LANGUAGES } from './config';

const LOCALES: Record<string, string> = {
  en: 'en-US', ru: 'ru-RU', uz: 'uz-UZ', tr: 'tr-TR', de: 'de-DE', fr: 'fr-FR', es: 'es-ES',
  it: 'it-IT', ar: 'ar-SA', kk: 'kk-KZ', zh: 'zh-CN', ja: 'ja-JP', ko: 'ko-KR', pt: 'pt-PT',
};
const KEY = 'jarvis_lang_v1';

export const toCode = (v: string): string => (v || DEFAULT_LANGUAGE).slice(0, 2).toLowerCase();
/** Locale for the speech recognizer. */
export const toLocale = (code: string): string => LOCALES[toCode(code)] ?? code;
/** Locale for the voice: Jarvis keeps his British accent in English. */
export const toTtsLocale = (code: string): string => (toCode(code) === 'en' ? 'en-GB' : toLocale(code));

export async function loadLanguage(): Promise<string> {
  try {
    const v = await AsyncStorage.getItem(KEY);
    if (v) return toCode(v);
  } catch {
    /* use default */
  }
  return DEFAULT_LANGUAGE;
}
export const saveLanguage = (code: string): void => {
  AsyncStorage.setItem(KEY, code).catch(() => {});
};
export const nextLanguage = (current: string): string => {
  const i = LANGUAGES.indexOf(current);
  return LANGUAGES[(i + 1) % LANGUAGES.length] ?? DEFAULT_LANGUAGE;
};
