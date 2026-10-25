import { config } from "../../config/env.js";

/** Small JSON-over-HTTP helper for tools. Throws Error with a short readable message. */
export async function getJson(url, { method = "GET", headers = {}, body, timeoutMs = config.tools.toolTimeoutMs } = {}) {
  let res;
  try {
    res = await fetch(url, {
      method,
      headers: { Accept: "application/json", "User-Agent": "jarvis-assistant/2.0", ...(body ? { "Content-Type": "application/json" } : {}), ...headers },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (e) {
    throw new Error(e?.name === "TimeoutError" ? "the service timed out" : "the service is unreachable");
  }
  if (!res.ok) throw new Error(`the service answered HTTP ${res.status}`);
  try {
    return await res.json();
  } catch {
    throw new Error("the service returned an unreadable answer");
  }
}
