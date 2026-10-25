// Add any phonetic mis-hearings your accent/microphone produces here (Latin and Cyrillic).
export const WAKE_WORDS = [
  "jarvis", "jarvas", "jarvus", "jarvice", "service",
  "джарвис", "жарвис", "джарвіс", "жарвіс", "ярвис", "чарвис",
];
const GREETINGS = ["hey", "hi", "hello", "okay", "ok", "эй", "хей", "привет", "ей"];

// \b is ASCII-only in JavaScript, so Unicode-aware boundaries are used to support Cyrillic.
const WAKE_RE = new RegExp(
  `(?<![\\p{L}\\p{N}])(?:(?:${GREETINGS.join("|")})[\\s,]+)?(?:${WAKE_WORDS.join("|")})(?![\\p{L}\\p{N}])[\\s,.!?:;-]*`,
  "iu"
);

/**
 * Returns null when there is no wake word (the speech must be ignored),
 * otherwise the command text spoken AFTER the wake word (may be "").
 */
export const extractAfterWake = (text) => {
  const m = WAKE_RE.exec(text);
  if (!m) return null;
  return text.slice(m.index + m[0].length).trim();
};
