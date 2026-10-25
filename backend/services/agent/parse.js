/** First balanced {...} object in the text (string/escape aware), parsed; or null. */
export function extractJson(text) {
  const start = text.indexOf("{");
  if (start < 0) return null;
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
    } else if (ch === '"') inStr = true;
    else if (ch === "{") depth++;
    else if (ch === "}" && --depth === 0) {
      try { return JSON.parse(text.slice(start, i + 1)); } catch { return null; }
    }
  }
  return null;
}

/** Interprets one model message under the agent protocol. Never throws. */
export function parseAgent(raw) {
  const t = String(raw ?? "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  const obj = extractJson(t);
  if (obj && typeof obj === "object") {
    if (typeof obj.tool === "string" && obj.tool) {
      return { type: "tool", name: obj.tool, args: obj.args && typeof obj.args === "object" && !Array.isArray(obj.args) ? obj.args : {} };
    }
    if (typeof obj.reply === "string") return { type: "final", reply: obj.reply, lang: obj.lang };
  }
  // truncated / slightly broken JSON that still carries a reply
  const m = t.match(/"reply"\s*:\s*"((?:[^"\\]|\\.)*)"/s);
  if (m) {
    try { return { type: "final", reply: JSON.parse(`"${m[1]}"`) }; } catch { return { type: "final", reply: m[1] }; }
  }
  if (/^[\[{]/.test(t)) return { type: "invalid" };
  return { type: "final", reply: t }; // model ignored the format and just answered: that's fine
}

/** Spoken text: strip markdown/emoji noise, collapse whitespace. */
export const cleanSpeech = (s) =>
  String(s ?? "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/[*_`#>~]+/g, "")
    .replace(/\p{Extended_Pictographic}/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 900);

export const normLang = (l) => {
  const code = String(l ?? "").toLowerCase().split(/[-_]/)[0];
  return /^[a-z]{2,3}$/.test(code) ? code : undefined;
};
