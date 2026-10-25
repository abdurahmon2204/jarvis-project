export class LLMError extends Error {
  /** kind: auth | model | rate_limit | transient | bad_request | empty */
  constructor(message, { kind, status, provider, retryAfterMs } = {}) {
    super(message);
    this.name = "LLMError";
    this.kind = kind;
    this.status = status;
    this.provider = provider;
    this.retryAfterMs = retryAfterMs;
  }
}

const parseRetryAfter = (h) => {
  if (!h) return undefined;
  const s = Number(h);
  return Number.isFinite(s) ? Math.round(s * 1000) : undefined;
};

export const classify = (status, msg = "") => {
  if (status === 401 || status === 403) return "auth";
  if (status === 400 && /api key|invalid.*key|key.*invalid|permission denied/i.test(msg)) return "auth";
  // A quota of 0 means "this particular model is not available on your plan"
  if (status === 429 && /limit:\s*0|free tier|not available (for|on) (the )?free/i.test(msg)) return "model";
  if (status === 429) return "rate_limit";
  if (status === 404 || status === 410) return "model";
  if (status === 400 && /model|decommission|deprecat|not found|not supported|does not exist/i.test(msg)) return "model";
  if (status === 408 || status >= 500) return "transient";
  return "bad_request";
};

export async function request(provider, url, { method = "POST", headers = {}, body, timeoutMs = 20000 } = {}) {
  let res;
  try {
    res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json", ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (e) {
    const why = e?.name === "TimeoutError" ? `timed out after ${timeoutMs} ms` : e?.cause?.code || e?.message;
    throw new LLMError(`${provider}: network error (${why})`, { kind: "transient", provider });
  }

  const raw = await res.text();
  let data = null;
  try { data = JSON.parse(raw); } catch { /* not JSON */ }

  if (res.ok) return data ?? {};

  const msg = data?.error?.message || data?.message || raw.slice(0, 300) || `HTTP ${res.status}`;
  throw new LLMError(`${provider}: ${msg}`, {
    kind: classify(res.status, msg),
    status: res.status,
    provider,
    retryAfterMs: parseRetryAfter(res.headers.get("retry-after")),
  });
}

export const stripThinking = (t) => (t || "").replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
