import { listScheduled } from './deviceActions';
import type { ChatContext } from './types';

/** What the assistant needs to know about this phone right now (time zone, active timers/alarms). */
export async function buildContext(): Promise<ChatContext> {
  let timezone = '';
  try {
    timezone = Intl.DateTimeFormat().resolvedOptions().timeZone ?? '';
  } catch {
    /* Intl unavailable */
  }
  return {
    platform: 'android',
    tzOffsetMin: -new Date().getTimezoneOffset(),
    timezone,
    scheduled: await listScheduled().catch(() => []),
  };
}
