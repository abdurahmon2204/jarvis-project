// All "local time" math is done with the client's UTC offset (minutes east of UTC),
// while "now" always comes from the server clock (a wrong phone clock can't break scheduling).
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const pad = (n) => String(n).padStart(2, "0");

export const localDate = (ms, off) => new Date(ms + off * 60000);

export const formatClock = (ms, off) => {
  const d = localDate(ms, off);
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
};

export const formatLocal = (ms, off) => {
  const d = localDate(ms, off);
  return `${DAYS[d.getUTCDay()]}, ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}, ${formatClock(ms, off)}`;
};

export const offsetLabel = (off) => {
  const sign = off < 0 ? "-" : "+";
  const a = Math.abs(off);
  return `UTC${sign}${pad(Math.floor(a / 60))}:${pad(a % 60)}`;
};

export const parseHHMM = (s) => {
  const m = /^\s*(\d{1,2}):(\d{2})\s*$/.exec(String(s ?? ""));
  if (!m) return null;
  const h = +m[1], mi = +m[2];
  return h > 23 || mi > 59 ? null : { h, mi };
};

export const parseDate = (s) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s ?? "").trim());
  if (!m) return null;
  const y = +m[1], mo = +m[2], d = +m[3];
  const t = new Date(Date.UTC(y, mo - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === mo - 1 && t.getUTCDate() === d ? { y, mo, d } : null;
};

const toEpoch = ({ y, mo, d, h, mi }, off) => Date.UTC(y, mo - 1, d, h, mi) - off * 60000;

/** "07:30" (+ optional "YYYY-MM-DD") -> epoch ms. Without a date: today if still ahead, else tomorrow. */
export function nextOccurrence(hhmm, nowMs, off, dateStr) {
  const t = parseHHMM(hhmm);
  if (!t) return { error: "time must be HH:MM in 24-hour format" };
  if (dateStr) {
    const dt = parseDate(dateStr);
    if (!dt) return { error: "date must be YYYY-MM-DD" };
    return { atMs: toEpoch({ ...dt, ...t }, off) };
  }
  const now = localDate(nowMs, off);
  let ms = toEpoch({ y: now.getUTCFullYear(), mo: now.getUTCMonth() + 1, d: now.getUTCDate(), ...t }, off);
  if (ms <= nowMs + 5000) ms += 86400000;
  return { atMs: ms };
}

/** "YYYY-MM-DD HH:MM" or "YYYY-MM-DDTHH:MM" in the user's local time -> epoch ms. */
export function parseWhen(s, off) {
  const m = /^\s*(\d{4}-\d{2}-\d{2})[T ](\d{1,2}:\d{2})\s*$/.exec(String(s ?? ""));
  if (!m) return { error: 'when must look like "YYYY-MM-DD HH:MM" (local time)' };
  return nextOccurrence(m[2], 0, off, m[1]);
}

export const humanDuration = (sec) => {
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  const parts = [];
  if (h) parts.push(`${h} hour${h > 1 ? "s" : ""}`);
  if (m) parts.push(`${m} minute${m > 1 ? "s" : ""}`);
  if (s && !h) parts.push(`${s} second${s > 1 ? "s" : ""}`);
  return parts.join(" ") || "0 seconds";
};
