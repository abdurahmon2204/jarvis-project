const API_URL = (import.meta.env.VITE_API_URL || "http://localhost:5000/api").replace(/\/$/, "");
const APP_KEY = import.meta.env.VITE_APP_KEY || "";
const STORE_KEY = "jarvis_session_v1";

const readSession = () => {
  try { return JSON.parse(localStorage.getItem(STORE_KEY) || "null"); } catch { return null; }
};
const writeSession = (s) => {
  try { s ? localStorage.setItem(STORE_KEY, JSON.stringify(s)) : localStorage.removeItem(STORE_KEY); } catch { /* private mode */ }
};

let memorySession = null; // fallback when localStorage is unavailable

async function register() {
  const res = await fetch(`${API_URL}/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(APP_KEY ? { "x-app-key": APP_KEY } : {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Registration failed (HTTP ${res.status})`);
  memorySession = { deviceId: data.deviceId, token: data.token };
  writeSession(memorySession);
  return memorySession;
}

const getSession = async () => memorySession || readSession() || register();

async function authFetch(path, init = {}, retried = false) {
  const session = await getSession();
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init.headers || {}), Authorization: `Bearer ${session.token}` },
  });
  if (res.status === 401 && !retried) {
    memorySession = null;
    writeSession(null);
    return authFetch(path, init, true); // token expired / backend secret rotated: register again once
  }
  return res;
}

const buildContext = () => ({
  platform: "web",
  tzOffsetMin: -new Date().getTimezoneOffset(),
  timezone: (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || ""; } catch { return ""; } })(),
  scheduled: [],
});

/** Returns { reply, lang, actions }. */
export const sendMessage = async (message) => {
  const res = await authFetch("/chat", { method: "POST", body: JSON.stringify({ message, context: buildContext() }) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (HTTP ${res.status})`);
  return { reply: data.reply, lang: data.lang, actions: data.actions || [] };
};

export const clearMemory = () => authFetch("/chat/history", { method: "DELETE" });
export const deleteMyData = () => authFetch("/me", { method: "DELETE" });
