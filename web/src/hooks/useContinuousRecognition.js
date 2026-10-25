import { useEffect, useRef, useState } from "react";

const SR =
  typeof window !== "undefined"
    ? window.SpeechRecognition || window.webkitSpeechRecognition
    : null;

/**
 * Keeps the microphone recognizer running while `enabled` is true.
 * Chrome ends continuous sessions every so often, so we auto-restart.
 * Every result chunk is reported via onResult({ key, text, isFinal }).
 * `key` is unique per (session, result index) so callers can tell chunks apart.
 */
export default function useContinuousRecognition({
  enabled,
  lang = "uz-UZ", // <--- Standart til o'zbek tiliga o'zgartirildi
  onResult,
  onFatalError,
}) {
  const onResultRef = useRef(onResult);
  const onFatalRef = useRef(onFatalError);
  const [active, setActive] = useState(false);

  useEffect(() => {
    onResultRef.current = onResult;
    onFatalRef.current = onFatalError;
  });

  useEffect(() => {
    if (!SR || !enabled) return;

    let stopped = false;
    let session = 0;
    let restartTimer;

    const rec = new SR();
    rec.lang = lang;
    rec.continuous = true;
    rec.interimResults = true;

    rec.onstart = () => {
      session += 1;
      setActive(true);
    };

    rec.onresult = (event) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const r = event.results[i];
        onResultRef.current?.({
          key: `${session}:${i}`,
          text: r[0].transcript,
          isFinal: r.isFinal,
        });
      }
    };

    rec.onerror = (event) => {
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        stopped = true; // don't loop on a permission problem
        onFatalRef.current?.(event.error);
      }
      // "no-speech", "aborted", "network" etc. are recovered by onend → restart
    };

    rec.onend = () => {
      setActive(false);
      if (!stopped) {
        restartTimer = setTimeout(() => {
          try { rec.start(); } catch { /* already running */ }
        }, 300);
      }
    };

    try { rec.start(); } catch { /* already running */ }

    return () => {
      stopped = true;
      clearTimeout(restartTimer);
      rec.onstart = rec.onresult = rec.onerror = rec.onend = null;
      rec.abort();
      setActive(false);
    };
  }, [enabled, lang]);

  return { supported: Boolean(SR), active };
}