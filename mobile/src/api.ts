import AsyncStorage from '@react-native-async-storage/async-storage';
import { APP_KEY, BACKEND_URL } from './config';
import type { Action, ChatContext, ChatResult } from './types';

const STORE_KEY = 'jarvis_session_v1';
type Session = { deviceId: string; token: string };

let session: Session | null = null;
const base = () => BACKEND_URL.replace(/\/+$/, '');

async function http(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') {
      throw new Error(`The server did not answer within ${Math.round(timeoutMs / 1000)} s.`);
    }
    throw new Error(`Cannot reach the server (${base()}). Check your internet connection.`);
  } finally {
    clearTimeout(timer);
  }
}

async function register(timeoutMs: number): Promise<Session> {
  const res = await http(
    `${base()}/api/register`,
    { method: 'POST', headers: APP_KEY ? { 'x-app-key': APP_KEY } : {} },
    timeoutMs,
  );
  const data = await res.json().catch(() => ({} as { deviceId?: string; token?: string; error?: string }));
  if (!res.ok || !data.token || !data.deviceId) {
    throw new Error(data.error ?? `Registration failed (HTTP ${res.status})`);
  }
  session = { deviceId: data.deviceId, token: data.token };
  AsyncStorage.setItem(STORE_KEY, JSON.stringify(session)).catch(() => {});
  return session;
}

async function getSession(timeoutMs: number): Promise<Session> {
  if (session) return session;
  try {
    const raw = await AsyncStorage.getItem(STORE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Session;
      if (parsed?.token && parsed?.deviceId) {
        session = parsed;
        return parsed;
      }
    }
  } catch {
    /* corrupted storage: register again */
  }
  return register(timeoutMs);
}

async function authed(path: string, init: RequestInit, timeoutMs: number, retried = false): Promise<Response> {
  const s = await getSession(timeoutMs);
  const res = await http(
    `${base()}${path}`,
    { ...init, headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}), Authorization: `Bearer ${s.token}` } },
    timeoutMs,
  );
  if (res.status === 401 && !retried) {
    session = null;
    await AsyncStorage.removeItem(STORE_KEY).catch(() => {});
    return authed(path, init, timeoutMs, true); // expired token or rotated secret: register again once
  }
  return res;
}

/** Sends one message (plus phone context) and returns the reply, its language and phone actions to run. */
export async function chat(message: string, context: ChatContext, timeoutMs = 45_000): Promise<ChatResult> {
  const res = await authed('/api/chat', { method: 'POST', body: JSON.stringify({ message, context }) }, timeoutMs);
  const data = await res
    .json()
    .catch(() => ({} as { reply?: string; lang?: string; actions?: Action[]; error?: string }));
  if (!res.ok) throw new Error(data.error ?? `Server returned HTTP ${res.status}`);
  if (!data.reply) throw new Error('Server returned an empty reply');
  return { reply: data.reply, lang: data.lang, actions: Array.isArray(data.actions) ? data.actions : [] };
}

/** Wakes up a sleeping free-tier backend in the background. Never throws. */
export function warmUp(): void {
  http(`${base()}/api/health`, {}, 60_000).catch(() => {});
}

export async function clearMemory(): Promise<void> {
  await authed('/api/chat/history', { method: 'DELETE' }, 20_000);
}
