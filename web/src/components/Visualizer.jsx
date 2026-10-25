const BARS = 36;

export default function Visualizer({ active }) {
  return (
    <div className="flex h-24 items-center justify-center gap-[3px]" aria-hidden>
      {Array.from({ length: BARS }, (_, i) => {
        const envelope = Math.exp(-Math.pow((i - BARS / 2) / (BARS / 4), 2));
        return (
          <span
            key={i}
            className={`wave-bar w-[3px] rounded-full bg-neon shadow-[0_0_8px_#00e5ff] ${
              active ? "active" : ""
            }`}
            style={{
              height: `${30 + envelope * 70}px`,
              animationDuration: `${0.7 + (i % 7) * 0.12}s`,
              animationDelay: `${(i % 9) * -0.15}s`,
              opacity: 0.4 + envelope * 0.6,
            }}
          />
        );
      })}
    </div>
  );
}
