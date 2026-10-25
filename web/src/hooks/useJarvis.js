import { useCallback, useEffect, useRef, useState } from "react";
import useContinuousRecognition from "./useContinuousRecognition";
import useSpeechSynthesis from "./useSpeechSynthesis";
import { sendMessage } from "../services/api";
import { extractAfterWake } from "../utils/wakeWord";
import { loadLang, saveLang, toLocale } from "../utils/lang";
import { playSleepChime, playWakeChime, unlockAudio } from "../utils/chime";

// If you say only "Jarvis" and then nothing, go back to standby after this long.
const COMMAND_TIMEOUT_MS = 8000;

/**
 * Phases:
 *   standby  : mic is on, every utterance is IGNORED unless it contains the wake word
 *   awake    : wake word heard → chime + glow → capturing the command
 *   thinking : command sent to the backend (mic is off)
 *   speaking : reading the reply aloud (mic is off, so Jarvis can't hear itself)
 */
export default function useJarvis() {
  // Tilni doimiy ravishda o'zbek tiliga ("uz") majburiy qilib qo'yamiz
  const [lang, setLangState] = useState("uz"); 
  const langRef = useRef("uz");

  const [armed, setArmed] = useState(false); // user clicked "Initialize" (mic permission + audio unlock)
  const [phase, setPhaseState] = useState("standby");
  const [heard, setHeard] = useState("");     // live command text while awake
  const [userText, setUserText] = useState("");
  const [reply, setReply] = useState("");
  const [error, setError] = useState(null);

  const phaseRef = useRef("standby");
  const wakeKeyRef = useRef(null);  // which recognition result contained the wake word
  const timerRef = useRef(null);

  const setLang = useCallback((code) => {
    // Til doim "uz" bo'lib qoladi
    langRef.current = "uz";
    setLangState("uz");
    saveLang("uz");
  }, []);

  const setPhase = useCallback((p) => {
    phaseRef.current = p;
    setPhaseState(p);
  }, []);

  const { speak, cancel, supported: ttsSupported } = useSpeechSynthesis();

  const clearTimer = useCallback(() => {
    clearTimeout(timerRef.current);
    timerRef.current = null;
  }, []);

  const goStandby = useCallback(() => {
    clearTimer();
    wakeKeyRef.current = null;
    setHeard("");
    setPhase("standby");
  }, [clearTimer, setPhase]);

  const startTimeout = useCallback(() => {
    clearTimer();
    timerRef.current = setTimeout(() => {
      if (phaseRef.current === "awake") {
        playSleepChime();
        goStandby();
      }
    }, COMMAND_TIMEOUT_MS);
  }, [clearTimer, goStandby]);

  const wake = useCallback(() => {
    setError(null);
    setPhase("awake");
    playWakeChime();
    startTimeout();
  }, [setPhase, startTimeout]);

  // The ONLY place where text leaves the browser for the backend.
  const submit = useCallback(
    async (text) => {
      clearTimer();
      setUserText(text);
      setReply("");
      setHeard("");
      setError(null);
      setPhase("thinking");
      try {
        const { reply: answer, lang: replyLang, actions } = await sendMessage(text);
        for (const a of actions) if (a.type === "set_language") setLang(a.lang);
        // Backend boshqa tilni yuborsa ham e'tibor bermasdan o'zbek tilida saqlaymiz
        setReply(answer);
        setPhase("speaking");
        speak(answer, goStandby, "uz-UZ");
      } catch (err) {
        setError(err.message);
        setPhase("speaking");
        speak("Tizimda xatolik yuz berdi. Iltimos, qaytadan urinib ko'ring.", goStandby, "uz-UZ");
      }
    },
    [speak, goStandby, clearTimer, setPhase, setLang]
  );

  const handleCommand = useCallback(
    (command, isFinal) => {
      setHeard(command);
      startTimeout(); // user is still talking → keep the session alive
      if (isFinal && command) submit(command);
    },
    [startTimeout, submit]
  );

  const handleResult = useCallback(
    ({ key, text, isFinal }) => {
      const t = text.trim();
      if (!t) return;

      // ── STANDBY: ignore everything that doesn't contain the wake word ──
      if (phaseRef.current === "standby") {
        const after = extractAfterWake(t);
        if (after === null) return;
        wakeKeyRef.current = key;
        wake();
        handleCommand(after, isFinal);
        return;
      }

      // ── AWAKE: collect the command ──
      if (phaseRef.current === "awake") {
        if (key === wakeKeyRef.current) {
          handleCommand(extractAfterWake(t) ?? t, isFinal);
        } else {
          handleCommand(t, isFinal);
        }
      }
    },
    [wake, handleCommand]
  );

  const { supported: sttSupported, active: micLive } = useContinuousRecognition({
    enabled: armed && (phase === "standby" || phase === "awake"),
    lang: "uz-UZ", // Mikrofon doimiy ravishda o'zbek tilini tinglaydi
    onResult: handleResult,
    onFatalError: (code) => {
      setError(
        code === "not-allowed"
          ? "Mikrofondan foydalanish taqiqlandi. Brauzerdan ruxsat bering."
          : "Ovozli xizmat mavjud emas."
      );
      setArmed(false);
      goStandby();
    },
  });

  useEffect(() => () => clearTimeout(timerRef.current), []);

  const arm = useCallback(() => {
    unlockAudio();
    setError(null);
    goStandby();
    setArmed(true);
  }, [goStandby]);

  const disarm = useCallback(() => {
    cancel();
    goStandby();
    setArmed(false);
  }, [cancel, goStandby]);

  const toggle = useCallback(() => {
    const p = phaseRef.current;
    if (p === "standby") wake();
    else if (p === "awake") goStandby();
    else if (p === "speaking") {
      cancel();
      goStandby();
    }
  }, [wake, goStandby, cancel]);

  // Tilni o'zgartirish funksiyasi o'chirildi, doim o'zbek tilida qoladi
  const cycleLang = useCallback(() => {
    // Hech qayerga o'zgarmaydi, doim uz
  }, []);

  return {
    lang: "uz",
    cycleLang,
    armed,
    phase,
    micLive,
    transcript: phase === "awake" ? heard : userText,
    reply,
    error,
    supported: sttSupported && ttsSupported,
    arm,
    disarm,
    toggle,
  };
}