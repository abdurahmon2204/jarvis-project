import { AppState, PermissionsAndroid, Platform } from 'react-native';
import Contacts from 'react-native-contacts';

import { normalizeName, nameScore } from './nameMatch';

export type ContactLookup = { ok: true; name: string; number: string } | { ok: false; reason: string };

async function ensurePermission(): Promise<boolean> {
  if (Platform.OS !== 'android') return false;
  const perm = PermissionsAndroid.PERMISSIONS.READ_CONTACTS;
  if (await PermissionsAndroid.check(perm)) return true;
  if (AppState.currentState !== 'active') return false; // can't show a dialog from the background
  return (await PermissionsAndroid.request(perm)) === PermissionsAndroid.RESULTS.GRANTED;
}

export async function findContact(spokenName: string): Promise<ContactLookup> {
  if (!(await ensurePermission())) {
    return { ok: false, reason: 'I need permission to read your contacts. Open the app and allow it.' };
  }
  const query = normalizeName(spokenName);
  const all = await Contacts.getAllWithoutPhotos();
  let best: { score: number; name: string; number: string } | null = null;
  for (const c of all) {
    const display = [c.givenName, c.middleName, c.familyName].filter(Boolean).join(' ') || c.displayName || '';
    const phones = c.phoneNumbers ?? [];
    if (!phones.length) continue;
    const score = Math.max(nameScore(query, normalizeName(display)), nameScore(query, normalizeName(c.displayName ?? '')));
    if (score < 0.6 || (best && best.score >= score)) continue;
    const mobile = phones.find(p => /mobile|cell|main/i.test(p.label ?? '')) ?? phones[0];
    best = { score, name: display, number: mobile.number };
  }
  return best
    ? { ok: true, name: best.name, number: best.number.replace(/[^\d+]/g, '') }
    : { ok: false, reason: `I couldn't find "${spokenName}" in your contacts.` };
}
