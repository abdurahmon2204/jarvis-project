import { Alert, AppState, Linking, NativeModules } from 'react-native';
import notifee, {
  AlarmType,
  AndroidCategory,
  AndroidImportance,
  AndroidNotificationSetting,
  AndroidVisibility,
  RepeatFrequency,
  TimestampTrigger,
  TriggerType,
} from '@notifee/react-native';
import { findContact } from './contacts';
import type { Action, ScheduledItem, ScheduleKind } from './types';

const ALERT_CHANNEL = 'jarvis_alerts';
const LAUNCH_TYPES = ['call', 'message', 'open_app', 'open_url', 'navigate', 'music'] as const;
type LaunchAction = Extract<Action, { type: (typeof LAUNCH_TYPES)[number] }>;
const isLaunch = (a: Action): a is LaunchAction => (LAUNCH_TYPES as readonly string[]).includes(a.type);

const enc = encodeURIComponent;
const JarvisDevice = NativeModules.JarvisDevice as { openApp?: (name: string) => Promise<boolean> } | undefined;

/* ───────────────────── timers, alarms, reminders ───────────────────── */
// They are real scheduled notifications (AlarmManager), so they ring even if Jarvis is closed,
// the phone is locked, or the phone restarts. They live in Jarvis, not in the system Clock app.

async function alertChannel(): Promise<string> {
  return notifee.createChannel({
    id: ALERT_CHANNEL,
    name: 'Timers, alarms and reminders',
    importance: AndroidImportance.HIGH,
    sound: 'default',
    vibration: true,
  });
}

let warnedExactAlarm = false;
async function warnIfNoExactAlarm(): Promise<void> {
  if (warnedExactAlarm || AppState.currentState !== 'active') return;
  try {
    const s = await notifee.getNotificationSettings();
    if (s.android.alarm === AndroidNotificationSetting.DISABLED) {
      warnedExactAlarm = true;
      Alert.alert(
        'Allow exact alarms',
        'Without this permission Android may delay timers and alarms by several minutes.',
        [{ text: 'Open settings', onPress: () => notifee.openAlarmPermissionSettings() }, { text: 'Later', style: 'cancel' }],
      );
    }
  } catch {
    /* settings unavailable */
  }
}

const TITLES: Record<ScheduleKind, string> = { timer: 'Timer finished', alarm: 'Alarm', reminder: 'Reminder' };

async function schedule(a: Extract<Action, { type: 'schedule' }>): Promise<void> {
  const channelId = await alertChannel();
  await warnIfNoExactAlarm();
  await notifee.createTriggerNotification(
    {
      id: a.id,
      title: TITLES[a.kind],
      body: a.label,
      data: { jarvisKind: a.kind, label: a.label },
      android: {
        channelId,
        category: AndroidCategory.ALARM,
        importance: AndroidImportance.HIGH,
        visibility: AndroidVisibility.PUBLIC,
        sound: 'default',
        loopSound: a.kind !== 'reminder', // timers/alarms keep ringing until dismissed (or after 60 s)
        timeoutAfter: 60_000,
        vibrationPattern: [300, 500, 300, 500],
        autoCancel: true,
        pressAction: { id: 'default', launchActivity: 'default' },
        actions: [{ title: 'Dismiss', pressAction: { id: 'dismiss' } }],
      },
    },
    {
      type: TriggerType.TIMESTAMP,
      timestamp: a.atMs,
      alarmManager: { type: AlarmType.SET_EXACT_AND_ALLOW_WHILE_IDLE },
      ...(a.repeat !== 'none' && { repeatFrequency: a.repeat === 'daily' ? RepeatFrequency.DAILY : RepeatFrequency.WEEKLY }),
    },
  );
}

async function cancel(ids: string[]): Promise<void> {
  await notifee.cancelTriggerNotifications(ids);
  await Promise.all(ids.map(id => notifee.cancelNotification(id).catch(() => {})));
}

/** What is currently scheduled (sent to the assistant so it can answer "what alarms do I have?"). */
export async function listScheduled(): Promise<ScheduledItem[]> {
  const list = await notifee.getTriggerNotifications();
  const out: ScheduledItem[] = [];
  for (const t of list) {
    const kind = t.notification.data?.jarvisKind;
    if (t.trigger.type !== TriggerType.TIMESTAMP || !t.notification.id || typeof kind !== 'string') continue;
    out.push({
      id: t.notification.id,
      kind: kind as ScheduleKind,
      label: String(t.notification.data?.label ?? t.notification.body ?? ''),
      atMs: (t.trigger as TimestampTrigger).timestamp,
    });
  }
  return out.sort((x, y) => x.atMs - y.atMs).slice(0, 20);
}

/* ───────────────────── actions that open another app ───────────────────── */
// Android 10+ forbids starting an app's screen from the background. So: if Jarvis is on screen the action
// runs immediately; otherwise a notification "Tap to ..." is shown and the action runs when you tap it.

const describe = (a: LaunchAction): string => {
  switch (a.type) {
    case 'call': return `Tap to call ${a.name ?? a.number ?? ''}`.trim();
    case 'message': return `Tap to send your ${a.channel === 'sms' ? 'SMS' : 'WhatsApp message'}${a.name ? ` to ${a.name}` : ''}`;
    case 'open_app': return `Tap to open ${a.name}`;
    case 'open_url': return 'Tap to open the link';
    case 'navigate': return `Tap for directions to ${a.destination}`;
    case 'music': return `Tap to search YouTube for ${a.query}`;
  }
};

/** Performs the action now. Returns a short problem description, or null on success. */
async function perform(a: LaunchAction): Promise<string | null> {
  switch (a.type) {
    case 'call':
    case 'message': {
      let number = a.number;
      if (!number && a.name) {
        const found = await findContact(a.name);
        if (!found.ok) return found.reason;
        number = found.number;
      }
      if (a.type === 'call') {
        if (!number) return 'I need a name or a number to call.';
        await Linking.openURL(`tel:${number}`); // opens the dialer; you press the call button
        return null;
      }
      const digits = (number ?? '').replace(/\D/g, '');
      await Linking.openURL(
        a.channel === 'whatsapp'
          ? `https://wa.me/${digits}?text=${enc(a.text)}`
          : `sms:${number ?? ''}?body=${enc(a.text)}`,
      );
      return null;
    }
    case 'open_app': {
      const ok = await JarvisDevice?.openApp?.(a.name);
      return ok ? null : `I couldn't find an app called ${a.name}.`;
    }
    case 'open_url':
      await Linking.openURL(a.url);
      return null;
    case 'navigate':
      await Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${enc(a.destination)}`);
      return null;
    case 'music':
      await Linking.openURL(`https://www.youtube.com/results?search_query=${enc(a.query)}`);
      return null;
  }
}

function runWhenActive<T>(fn: () => Promise<T>, timeoutMs = 10_000): Promise<T | null> {
  if (AppState.currentState === 'active') return fn();
  return new Promise(resolve => {
    const timer = setTimeout(() => {
      sub.remove();
      resolve(null);
    }, timeoutMs);
    const sub = AppState.addEventListener('change', s => {
      if (s !== 'active') return;
      sub.remove();
      clearTimeout(timer);
      fn().then(resolve, () => resolve(null));
    });
  });
}

async function deferViaNotification(a: LaunchAction): Promise<void> {
  const channelId = await alertChannel();
  await notifee.displayNotification({
    title: 'J.A.R.V.I.S.',
    body: describe(a),
    data: { jarvisAction: JSON.stringify(a) },
    android: {
      channelId,
      importance: AndroidImportance.HIGH,
      autoCancel: true,
      pressAction: { id: 'run_action', launchActivity: 'default' },
    },
  });
}

/** Runs an action that was stored in a tapped notification (called once the app is on screen). */
export async function consumeDeferred(raw: string): Promise<string | null> {
  try {
    const a = JSON.parse(raw) as Action;
    if (!isLaunch(a)) return null;
    return await runWhenActive(() => perform(a));
  } catch {
    return null;
  }
}

/** Handles the case where tapping the notification cold-started the app. */
export async function handleInitialNotification(): Promise<string | null> {
  try {
    const initial = await notifee.getInitialNotification();
    const raw = initial?.notification?.data?.jarvisAction;
    return typeof raw === 'string' ? await consumeDeferred(raw) : null;
  } catch {
    return null;
  }
}

/** Executes the phone actions returned with a reply. Returns human-readable problems (empty = all good). */
export async function runActions(actions: Action[]): Promise<string[]> {
  const problems: string[] = [];
  for (const a of actions) {
    try {
      if (a.type === 'schedule') await schedule(a);
      else if (a.type === 'cancel') await cancel(a.ids);
      else if (isLaunch(a)) {
        if (AppState.currentState === 'active') {
          const p = await perform(a);
          if (p) problems.push(p);
        } else {
          await deferViaNotification(a);
        }
      } // set_language is handled by the engine
    } catch (e) {
      problems.push(`I couldn't do that (${e instanceof Error ? e.message : String(e)}).`);
    }
  }
  return problems;
}
