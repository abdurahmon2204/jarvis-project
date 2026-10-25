import useJarvis from "./hooks/useJarvis";
import MicButton from "./components/MicButton";
import Visualizer from "./components/Visualizer";

const STATUS_LABEL = {
  standby: "STANDING BY",
  awake: "I'M LISTENING…",
  thinking: "PROCESSING…",
  speaking: "RESPONDING…",
};

const HINT = {
  standby: 'SAY "HEY JARVIS"',
  awake: "SPEAK YOUR COMMAND",
  thinking: "\u00A0",
  speaking: "TAP TO INTERRUPT",
};

export default function App() {
  const { lang, cycleLang, armed, phase, micLive, transcript, reply, error, supported, arm, disarm, toggle } =
    useJarvis();

  if (!supported) {
    return (
      <main className="flex min-h-screen items-center justify-center p-6 text-center font-mono text-neon">
        Speech APIs are unavailable in this browser. Please use Chrome or Edge.
      </main>
    );
  }

  // A user gesture is required once: mic permission + audio unlock
  if (!armed) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-8 p-6 font-mono text-neon">
        <h1 className="text-3xl font-light tracking-[0.5em] drop-shadow-[0_0_12px_#00e5ff]">
          J.A.R.V.I.S.
        </h1>
        <button
          onClick={arm}
          className="rounded border border-neon px-8 py-3 tracking-[0.4em] shadow-[0_0_25px_#00e5ff55] transition hover:bg-neon/15 hover:shadow-[0_0_40px_#00e5ff]"
        >
          INITIALIZE
        </button>
        {error && <p className="max-w-md text-center text-xs text-red-400">⚠ {error}</p>}
        <p className="max-w-sm text-center text-xs text-neon/40">
          Once online, J.A.R.V.I.S. waits silently until it hears "Hey Jarvis".
        </p>
      </main>
    );
  }

  const awake = phase === "awake";

  return (
    <main
      className={`flex min-h-screen flex-col items-center justify-between px-6 py-10 font-mono text-neon transition-shadow duration-500 ${
        awake ? "shadow-[inset_0_0_140px_#00e5ff44]" : "shadow-[inset_0_0_0_#00e5ff00]"
      }`}
    >
      <header className="relative w-full text-center">
        <h1 className="text-3xl font-light tracking-[0.5em] drop-shadow-[0_0_12px_#00e5ff]">
          J.A.R.V.I.S.
        </h1>
        <p className="mt-2 text-xs tracking-[0.3em] text-neon/60">{STATUS_LABEL[phase]}</p>
        <div className="absolute right-0 top-0 flex items-center gap-3 text-[10px] tracking-widest text-neon/50">
          <span className="flex items-center gap-1">
            <span
              className={`h-2 w-2 rounded-full ${micLive ? "bg-neon shadow-[0_0_8px_#00e5ff]" : "bg-neon/20"}`}
            />
            MIC
          </span>
          <button onClick={cycleLang} className="hover:text-neon" title="Listening language">LANG: {lang.toUpperCase()}</button>
          <button onClick={disarm} className="hover:text-neon">POWER OFF</button>
        </div>
      </header>

      <section className="flex w-full max-w-2xl flex-col items-center gap-6">
        <Visualizer active={awake || phase === "speaking"} />
        <MicButton phase={phase} onClick={toggle} />
        <p className="text-xs tracking-widest text-neon/50">{HINT[phase]}</p>
      </section>

      <section className="min-h-[9rem] w-full max-w-2xl space-y-3 text-sm leading-relaxed">
        {transcript && (
          <p className="rounded border border-neon/20 bg-neon/5 p-3 text-neon/70">
            <span className="mr-2 text-neon/40">YOU ›</span>
            {transcript}
          </p>
        )}
        {reply && phase !== "awake" && (
          <p className="rounded border border-neon/40 bg-neon/10 p-3 shadow-[0_0_20px_#00e5ff22]">
            <span className="mr-2 text-neon/60">JARVIS ›</span>
            {reply}
          </p>
        )}
        {error && <p className="text-center text-xs text-red-400">⚠ {error}</p>}
      </section>
    </main>
  );
}
