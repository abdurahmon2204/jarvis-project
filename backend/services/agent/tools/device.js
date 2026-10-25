import { randomUUID } from "node:crypto";
import { formatLocal, humanDuration, nextOccurrence, parseWhen } from "../time.js";
import { normLang } from "../parse.js";

// "Device tools" don't execute here. They validate the request, queue an action that the phone app
// performs, and tell the model what was queued, so its spoken confirmation matches reality.

const MAX_AHEAD_MS = 366 * 86400000;
const MAX_ACTIVE = 30;
const clean = (s, max, fallback = "") => (typeof s === "string" && s.trim() ? s.replace(/\s+/g, " ").trim().slice(0, max) : fallback);
const phone = (n) => {
  const d = String(n ?? "").replace(/[^\d+]/g, "");
  return /^\+?\d{3,15}$/.test(d) ? d : "";
};
const REPEATS = ["none", "daily", "weekly"];

function schedule(env, kind, atMs, label, repeat = "none") {
  if (!Number.isFinite(atMs) || atMs <= env.nowMs + 3000) return { error: "that moment is already in the past" };
  if (atMs > env.nowMs + MAX_AHEAD_MS) return { error: "that is too far ahead (one year maximum)" };
  const queued = env.actions.filter((a) => a.type === "schedule").length;
  if (env.ctx.scheduled.length + queued >= MAX_ACTIVE) return { error: "too many timers/alarms are already set" };
  env.emit({ type: "schedule", id: randomUUID(), kind, atMs, label, repeat });
  const when = kind === "timer" ? `rings at ${formatLocal(atMs, env.ctx.tzOffsetMin)}` : `is set for ${formatLocal(atMs, env.ctx.tzOffsetMin)}`;
  return { text: `${kind[0].toUpperCase()}${kind.slice(1)} "${label}" ${when}${repeat !== "none" ? `, repeating ${repeat}` : ""}.` };
}

export const setTimer = {
  name: "set_timer",
  kind: "device",
  usage: 'set_timer {"seconds":600,"label":"Pasta"}  -> countdown timer (you may also give "minutes" and "hours")',
  run(args, env) {
    const total = Math.round((Number(args.seconds) || 0) + 60 * (Number(args.minutes) || 0) + 3600 * (Number(args.hours) || 0));
    if (!(total >= 1 && total <= 172800)) return { error: "duration must be between 1 second and 48 hours" };
    const res = schedule(env, "timer", env.nowMs + total * 1000, clean(args.label, 80, "Timer"));
    return res.error ? res : { text: `Timer for ${humanDuration(total)}. ${res.text}` };
  },
};

export const setAlarm = {
  name: "set_alarm",
  kind: "device",
  usage: 'set_alarm {"time":"07:30","date":"2026-10-25","label":"Wake up","repeat":"daily"}  -> alarm at a clock time (24h; date optional: omit for the next occurrence; repeat: none|daily|weekly)',
  run(args, env) {
    const repeat = REPEATS.includes(args.repeat) ? args.repeat : "none";
    const t = nextOccurrence(args.time, env.nowMs, env.ctx.tzOffsetMin, typeof args.date === "string" ? args.date : undefined);
    if (t.error) return { error: t.error };
    return schedule(env, "alarm", t.atMs, clean(args.label, 80, "Alarm"), repeat);
  },
};

export const setReminder = {
  name: "set_reminder",
  kind: "device",
  usage: 'set_reminder {"text":"Call mom","when":"2026-10-24 09:00"} or {"text":"Take pills","in_seconds":3600}  -> reminder that rings with a message (when = local time)',
  run(args, env) {
    const text = clean(args.text, 80);
    if (!text) return { error: "text is required" };
    let atMs;
    if (Number.isFinite(Number(args.in_seconds)) && Number(args.in_seconds) > 0) atMs = env.nowMs + Math.round(Number(args.in_seconds)) * 1000;
    else {
      const w = parseWhen(args.when, env.ctx.tzOffsetMin);
      if (w.error) return { error: w.error };
      atMs = w.atMs;
    }
    return schedule(env, "reminder", atMs, text);
  },
};

export const cancelScheduled = {
  name: "cancel_scheduled",
  kind: "device",
  usage: 'cancel_scheduled {"label":"Pasta"} or {"all":true}  -> cancel timers/alarms/reminders listed in CONTEXT (optional "kind": timer|alarm|reminder)',
  run(args, env) {
    const kind = ["timer", "alarm", "reminder"].includes(args.kind) ? args.kind : null;
    const q = clean(args.label, 80).toLowerCase();
    const hits = env.ctx.scheduled.filter((s) => (!kind || s.kind === kind) && (args.all === true || (q && s.label.toLowerCase().includes(q)) || (!q && kind)));
    if (!hits.length) return { error: "no matching timer, alarm or reminder is set" };
    env.emit({ type: "cancel", ids: hits.map((h) => h.id) });
    return { text: `Cancelled ${hits.length}: ${hits.map((h) => `"${h.label}"`).join(", ")}.` };
  },
};

export const callContact = {
  name: "call_contact",
  kind: "device",
  sensitive: true,
  usage: 'call_contact {"name":"Alisher"} or {"number":"+998901234567"}  -> opens the phone dialer (the user taps call)',
  run(args, env) {
    const name = clean(args.name, 60), number = phone(args.number);
    if (!name && !number) return { error: "give a contact name or a phone number" };
    env.emit({ type: "call", ...(name && { name }), ...(number && { number }) });
    return { text: `Dialer opened for ${name || number}. The user must tap the call button.` };
  },
};

export const sendMessage = {
  name: "send_message",
  kind: "device",
  sensitive: true,
  usage: 'send_message {"channel":"sms","name":"Alisher","text":"I will be late"}  -> prepares an SMS or WhatsApp message (channel: sms|whatsapp; name or number); the user taps send',
  run(args, env) {
    const channel = args.channel === "whatsapp" ? "whatsapp" : "sms";
    const text = clean(args.text, 500), name = clean(args.name, 60), number = phone(args.to_number ?? args.number);
    if (!text) return { error: "text is required" };
    if (!name && !number && channel === "sms") return { error: "give a contact name or a phone number" };
    env.emit({ type: "message", channel, ...(name && { name }), ...(number && { number }), text });
    return { text: `Message drafted in ${channel}${name || number ? ` for ${name || number}` : ""}. The user must press send.` };
  },
};

export const openApp = {
  name: "open_app",
  kind: "device",
  sensitive: true,
  usage: 'open_app {"name":"Telegram"}  -> launches an installed app by its name',
  run(args, env) {
    const name = clean(args.name, 60);
    if (!name) return { error: "app name is required" };
    env.emit({ type: "open_app", name });
    return { text: `Opening ${name}.` };
  },
};

export const openLink = {
  name: "open_link",
  kind: "device",
  sensitive: true,
  usage: 'open_link {"url":"https://example.com"}  -> opens an https web page on the phone',
  run(args, env) {
    let u;
    try { u = new URL(String(args.url ?? "")); } catch { return { error: "invalid url" }; }
    if (u.protocol !== "https:" || String(args.url).length > 500) return { error: "only https links up to 500 characters are allowed" };
    env.emit({ type: "open_url", url: u.toString() });
    return { text: `Opening ${u.hostname}.` };
  },
};

export const navigate = {
  name: "navigate",
  kind: "device",
  sensitive: true,
  usage: 'navigate {"destination":"Amir Temur Square, Tashkent"}  -> opens maps with directions',
  run(args, env) {
    const destination = clean(args.destination, 120);
    if (destination.length < 2) return { error: "destination is required" };
    env.emit({ type: "navigate", destination });
    return { text: `Opening directions to ${destination}.` };
  },
};

export const playMusic = {
  name: "play_music",
  kind: "device",
  sensitive: true,
  usage: 'play_music {"query":"Queen Bohemian Rhapsody"}  -> searches YouTube for music/videos',
  run(args, env) {
    const query = clean(args.query, 100);
    if (!query) return { error: "query is required" };
    env.emit({ type: "music", query });
    return { text: `Searching YouTube for "${query}".` };
  },
};

export const setLanguage = {
  name: "set_language",
  kind: "device",
  webOk: true,
  usage: 'set_language {"language":"ru"}  -> switch the language used to LISTEN to the user and to speak (2-letter code: en, ru, uz, ...). Use when the user asks to speak another language',
  run(args, env) {
    const lang = normLang(args.language);
    if (!lang) return { error: "language must be a 2-letter code like en, ru, uz" };
    env.emit({ type: "set_language", lang });
    return { text: `Language switched to "${lang}" for listening and speaking. Reply in that language from now on.` };
  },
};
