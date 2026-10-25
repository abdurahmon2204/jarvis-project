import { useCallback, useEffect, useState } from "react";

const synth = typeof window !== "undefined" ? window.speechSynthesis : null;

import { toLocale } from "../utils/lang";

const pickVoice = (voices, lang = "en") => {
  const code = String(lang).toLowerCase().slice(0, 2);
  if (code === "en") {
    return (
      voices.find((v) => /en-GB/i.test(v.lang) && /male|daniel|ryan/i.test(v.name)) ||
      voices.find((v) => /en-GB/i.test(v.lang)) ||
      voices.find((v) => /^en/i.test(v.lang)) ||
      null
    );
  }
  return voices.find((v) => v.lang.toLowerCase().replace("_", "-").startsWith(code)) || null;
};

export default function useSpeechSynthesis({ rate = 1, pitch = 0.85 } = {}) {
  const [voices, setVoices] = useState([]);
  const [speaking, setSpeaking] = useState(false);

  useEffect(() => {
    if (!synth) return;
    const load = () => setVoices(synth.getVoices());
    load();
    synth.addEventListener("voiceschanged", load); // Chrome loads voices async
    return () => {
      synth.removeEventListener("voiceschanged", load);
      synth.cancel();
    };
  }, []);

  const speak = useCallback(
    (text, onEnd, lang = "en") => {
      if (!synth || !text) return onEnd?.();
      synth.cancel();

      const utterance = new SpeechSynthesisUtterance(text);
      const voice = pickVoice(voices, lang);
      if (voice) utterance.voice = voice;
      utterance.lang = voice?.lang || toLocale(lang); // lets the browser pick a matching voice if none is installed by name
      utterance.rate = rate;
      utterance.pitch = pitch;

      utterance.onstart = () => setSpeaking(true);
      const finish = () => {
        setSpeaking(false);
        onEnd?.();
      };
      utterance.onend = finish;
      utterance.onerror = finish;

      synth.speak(utterance);
    },
    [voices, rate, pitch]
  );

  const cancel = useCallback(() => {
    synth?.cancel();
    setSpeaking(false);
  }, []);

  return { speak, cancel, speaking, supported: Boolean(synth) };
}
