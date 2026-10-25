export default function MicButton({ phase, onClick }) {
  const awake = phase === "awake";
  const speaking = phase === "speaking";
  const thinking = phase === "thinking";
  const standby = phase === "standby";
  const bright = awake || speaking;

  return (
    <div className="relative flex h-44 w-44 items-center justify-center">
      {bright && (
        <>
          <span className="ring absolute inset-0 rounded-full border border-neon" />
          <span
            className="ring absolute inset-0 rounded-full border border-neon"
            style={{ animationDelay: "1.1s" }}
          />
        </>
      )}
      {thinking && (
        <span className="absolute inset-0 animate-spin rounded-full border-2 border-transparent border-t-neon" />
      )}

      <button
        onClick={onClick}
        disabled={thinking}
        aria-label={awake ? "Cancel" : "Wake J.A.R.V.I.S."}
        className={`relative z-10 flex h-32 w-32 items-center justify-center rounded-full border-2
          border-neon bg-neon/10 text-neon backdrop-blur transition-all duration-300
          hover:bg-neon/20 focus:outline-none disabled:cursor-wait
          ${standby ? "breathe" : ""}
          ${bright ? "scale-105 bg-neon/25 shadow-[0_0_70px_#00e5ff]" : ""}`}
      >
        <svg viewBox="0 0 24 24" className="h-12 w-12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <rect x="9" y="2" width="6" height="12" rx="3" />
          <path d="M5 11a7 7 0 0 0 14 0M12 18v4M8 22h8" />
        </svg>
      </button>
    </div>
  );
}
