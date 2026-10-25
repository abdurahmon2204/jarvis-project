// Tiny WebAudio chimes: no audio files needed.
let ctx = null;

export const unlockAudio = () => {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  if (!ctx) ctx = new AC();
  if (ctx.state === "suspended") ctx.resume();
};

const tone = (freq, start, dur, vol = 0.14) => {
  const t0 = ctx.currentTime + start;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(vol, t0 + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(gain).connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.05);
};

export const playWakeChime = () => {
  if (!ctx) return;
  tone(660, 0, 0.12);
  tone(990, 0.1, 0.2);
};

export const playSleepChime = () => {
  if (!ctx) return;
  tone(990, 0, 0.1);
  tone(520, 0.09, 0.18);
};
