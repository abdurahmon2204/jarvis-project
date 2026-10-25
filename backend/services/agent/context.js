const KINDS = ["timer", "alarm", "reminder"];

/** Never trust the client: clamp/shape everything that ends up in the prompt. */
export function sanitizeContext(raw) {
  const c = raw && typeof raw === "object" ? raw : {};
  const off = Number.isFinite(c.tzOffsetMin) && Math.abs(c.tzOffsetMin) <= 14 * 60 ? Math.round(c.tzOffsetMin) : 0;
  const scheduled = Array.isArray(c.scheduled)
    ? c.scheduled.slice(0, 20).map((s) => ({
        id: String(s?.id ?? "").slice(0, 64),
        label: String(s?.label ?? "").replace(/[\r\n]+/g, " ").slice(0, 80),
        atMs: Number.isFinite(Number(s?.atMs)) ? Number(s.atMs) : 0,
        kind: KINDS.includes(s?.kind) ? s.kind : "alarm",
      })).filter((s) => s.id)
    : [];
  return {
    platform: c.platform === "web" ? "web" : "android",
    tzOffsetMin: off,
    timezone: typeof c.timezone === "string" ? c.timezone.replace(/[^A-Za-z0-9_+\-/]/g, "").slice(0, 64) : "",
    scheduled,
  };
}
