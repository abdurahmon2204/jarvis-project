import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import {
  Alert,
  Animated,
  AppState,
  DeviceEventEmitter,
  Easing,
  NativeModules,
  PermissionsAndroid,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  Vibration,
  View,
} from 'react-native';
import notifee, { AndroidForegroundServiceType, AndroidImportance } from '@notifee/react-native';
import * as Vosk from 'react-native-vosk';
import Voice, { SpeechErrorEvent, SpeechResultsEvent } from '@react-native-voice/voice';
import Tts from 'react-native-tts';
import Sound from 'react-native-sound';
import * as api from './src/api';
import { BACKEND_URL, WAKE_ALIASES, VOSK_MODEL_NAME } from './src/config';
import * as device from './src/deviceActions';
import { buildContext } from './src/context';
import { loadLanguage, nextLanguage, saveLanguage, toLocale, toTtsLocale } from './src/language';

// User-editable settings live in src/config.ts
const WAKE_GRAMMAR = [...WAKE_ALIASES, '[unk]']; // closed vocabulary: the recognizer only hears the wake words

const REQUEST_TIMEOUT_MS = 45_000; // free-tier backends can take a while to wake up
const NO_SPEECH_TIMEOUT_MS = 8_000;     // woke up but you said nothing
const SILENCE_AFTER_SPEECH_MS = 1_800;  // end-of-command detection
const AUDIO_HANDOFF_MS = 400;           // lets the mic be released between Vosk and Voice

const CHANNEL_ID = 'jarvis_listening';
const NOTIFICATION_ID = 'jarvis_fgs';
const STOP_EVENT = 'JARVIS_STOP_REQUESTED'; // emitted by index.js when "Pause" is tapped in the notification
const TALK_EVENT = 'JARVIS_TALK_REQUESTED'; // emitted by index.js when "Speak" is tapped in the notification
const RUN_ACTION_EVENT = 'JARVIS_RUN_ACTION'; // emitted by index.js when a "Tap to call/open..." notification is tapped

type Phase = 'paused' | 'booting' | 'idle' | 'recording' | 'thinking' | 'speaking' | 'error';

type Snapshot = {
  phase: Phase;
  heard: string;     // live transcript while recording
  question: string;  // last full command
  reply: string;     // last answer
  error: string | null;
  lang: string; // language used to listen and speak (2-letter code)
};

const PHASE_META: Record<Phase, { color: string; label: string; hint: string }> = {
  paused:    { color: '#5C6B73', label: 'OFFLINE',      hint: 'Tap the orb to bring J.A.R.V.I.S. online' },
  booting:   { color: '#4A90A4', label: 'INITIALIZING', hint: 'Preparing the offline voice model (first launch can take a minute)' },
  idle:      { color: '#00E5FF', label: 'STANDING BY',  hint: 'Say "Jarvis"  ·  or tap the orb' },
  recording: { color: '#00FF9C', label: 'LISTENING',    hint: 'Speak your command' },
  thinking:  { color: '#FFB300', label: 'PROCESSING',   hint: '' },
  speaking:  { color: '#B66DFF', label: 'RESPONDING',   hint: 'Tap to interrupt' },
  error:     { color: '#FF4D6D', label: 'SYSTEM FAULT', hint: 'Tap the orb to retry' },
};

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

const describe = (e: unknown): string =>
  e instanceof Error ? e.message : typeof e === 'string' ? e : JSON.stringify(e);

/* ═════════════════ ANDROID BACKGROUND HELPERS ═════════════════ */

// Optional native partial wake-lock (see JarvisDeviceModule.kt). Silently no-ops if you skip it.
const KeepAlive = {
  acquire: () => NativeModules.JarvisDevice?.acquire?.(),
  release: () => NativeModules.JarvisDevice?.release?.(),
};

async function ensureMicPermission(): Promise<boolean> {
  // Android 14+: RECORD_AUDIO MUST be granted BEFORE a microphone foreground service is started.
  // iOS prompts automatically on first mic / speech use (Info.plist strings).
  if (Platform.OS !== 'android') return true;
  const perm = PermissionsAndroid.PERMISSIONS.RECORD_AUDIO;
  if (await PermissionsAndroid.check(perm)) return true;
  const result = await PermissionsAndroid.request(perm, {
    title: 'Microphone access',
    message: 'J.A.R.V.I.S. needs the microphone to hear the wake word and your commands.',
    buttonPositive: 'Allow',
    buttonNegative: 'Deny',
  });
  return result === PermissionsAndroid.RESULTS.GRANTED;
}

/**
 * Starts the persistent "J.A.R.V.I.S. is online" notification as a foreground service of type
 * `microphone`. This is what lets the process (and its microphone) survive backgrounding and screen-off.
 * Android 14+ only allows a microphone service to START while the app is visible, which is why
 * the engine calls this during boot, from the foreground.
 */
async function startListeningService(): Promise<void> {
  if (Platform.OS !== 'android') return;
  try {
    await notifee.requestPermission(); // Android 13+ POST_NOTIFICATIONS. The service still runs if denied.
  } catch {
    /* non-fatal */
  }
  const channelId = await notifee.createChannel({
    id: CHANNEL_ID,
    name: 'J.A.R.V.I.S. background listening',
    importance: AndroidImportance.LOW, // silent, no heads-up
  });
  await notifee.displayNotification({
    id: NOTIFICATION_ID,
    title: 'J.A.R.V.I.S. is online',
    body: 'Listening for "Jarvis"',
    android: {
      channelId,
      asForegroundService: true,
      foregroundServiceTypes: [AndroidForegroundServiceType.FOREGROUND_SERVICE_TYPE_MICROPHONE],
      ongoing: true,
      color: '#00E5FF',
      pressAction: { id: 'default', launchActivity: 'default' },
      actions: [
        { title: 'Speak', pressAction: { id: 'talk' } }, // manual trigger, works with the screen locked
        { title: 'Pause', pressAction: { id: 'stop' } },
      ],
    },
  });
}

async function stopListeningService(): Promise<void> {
  if (Platform.OS !== 'android') return;
  try {
    await notifee.stopForegroundService();
  } catch (e) {
    console.warn('[JARVIS] stopForegroundService failed', e);
  }
  try {
    await notifee.cancelNotification(NOTIFICATION_ID);
  } catch {
    /* already gone */
  }
}

/* ═════════════════════════════════════════════════════════════════
   JARVIS ENGINE: a module-level singleton, deliberately NOT tied to React.
   If you swipe the app away from Recents, Android destroys the Activity and React
   unmounts every component, but the foreground service keeps the process alive.
   Because the engine lives outside the component tree, listening carries on.
   ═════════════════════════════════════════════════════════════════ */
class JarvisEngine {
  private snap: Snapshot = { phase: 'paused', heard: '', question: '', reply: '', error: null, lang: 'en' };
  private listeners = new Set<() => void>();

  private voskLoaded = false;
  private ttsLocale = ''; // locale currently set on the TTS engine
  private wakeRunning = false;
  private wakeBusy = false;
  private booting = false;
  private modulesReady = false;
  private userPaused = false;

  private partial = '';
  private noSpeechTimer: ReturnType<typeof setTimeout> | null = null;
  private silenceTimer: ReturnType<typeof setTimeout> | null = null;
  private ttsDone: (() => void) | null = null;
  private activation: Sound | null = null;

  constructor() {
    // "Pause" button on the notification (emitted from index.js, works with the UI closed)
    DeviceEventEmitter.addListener(STOP_EVENT, () => {
      this.pause();
    });
    DeviceEventEmitter.addListener(TALK_EVENT, () => {
      this.beginCommand();
    });
    DeviceEventEmitter.addListener(RUN_ACTION_EVENT, (raw: string) => {
      device.consumeDeferred(raw).then(problem => problem && this.set({ error: problem }));
    });
  }

  /* ───── external-store API for useSyncExternalStore ───── */
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  getSnapshot = () => this.snap;

  private set(patch: Partial<Snapshot>) {
    this.snap = { ...this.snap, ...patch };
    this.listeners.forEach(l => l());
  }
  // A method (not a getter) so TypeScript doesn't narrow it across awaits
  private ph(): Phase {
    return this.snap.phase;
  }

  /* ───── public controls ───── */
  /** Called whenever the UI mounts. Starts on first launch; respects a manual pause. */
  autoStart() {
    if (!this.userPaused && this.ph() === 'paused') this.start();
  }

  async start() {
    if (this.booting) return;
    if (this.ph() !== 'paused' && this.ph() !== 'error') return; // already running
    this.booting = true;
    this.userPaused = false;
    try {
      this.set({ phase: 'booting', error: null });

      if (!(await ensureMicPermission())) {
        return this.fault('Microphone permission denied. Enable it in system settings, then tap the orb.');
      }
      if (!BACKEND_URL || BACKEND_URL.includes('YOUR-BACKEND')) {
        return this.fault('Backend URL is not set. Edit mobile/src/config.ts (BACKEND_URL) or run "npm run configure".');
      }
      api.warmUp(); // wakes a sleeping free-tier backend while the voice model loads
      if (!(await Voice.isAvailable())) {
        return this.fault('Speech recognition is unavailable on this device (Android: enable the Google app).');
      }

      await this.setupModules();
      this.set({ lang: await loadLanguage() });
      device.handleInitialNotification().then(problem => problem && this.set({ error: problem }));

      // Foreground service first (needs mic permission already granted, app visible), then the mic.
      try {
        await startListeningService();
      } catch (e) {
        return this.fault(`Could not start the background service. ${describe(e)}`);
      }
      KeepAlive.acquire();

      await this.startWakeWord();
    } catch (e) {
      this.fault(`Initialization failed. ${describe(e)}`);
    } finally {
      this.booting = false;
    }
  }

  /** Stops listening and removes the foreground service/notification. */
  async pause() {
    this.userPaused = true;
    this.clearTimers();
    this.set({ phase: 'paused', heard: '' }); // set first so any in-flight flow bails out
    Promise.resolve(Tts.stop()).catch(() => {}); // also resolves a pending speak()
    try {
      await Voice.cancel();
    } catch {
      /* nothing running */
    }
    await this.stopWakeWord();
    await stopListeningService();
    KeepAlive.release();
  }

  /** Orb tap: push-to-talk / cancel / interrupt / retry depending on state. */
  onOrbPress() {
    switch (this.ph()) {
      case 'idle':      this.beginCommand(); break;          // manual wake
      case 'recording': this.returnToIdle(); break;          // cancel
      case 'speaking':  Promise.resolve(Tts.stop()).catch(() => {}); break; // interrupt
      case 'paused':
      case 'error':     this.start(); break;                 // (re)start
      default: break;
    }
  }

  /* ───── one-time native module setup ───── */
  private async setupModules() {
    if (this.modulesReady) return;
    this.modulesReady = true;

    Voice.onSpeechPartialResults = this.onPartial;
    Voice.onSpeechResults = this.onResults;
    Voice.onSpeechError = this.onSpeechError;

    Vosk.onPartialResult(t => this.onWakeText(t));
    Vosk.onResult(t => this.onWakeText(t));
    Vosk.onFinalResult(t => this.onWakeText(t));
    Vosk.onError(e => {
      if (this.wakeRunning) this.fault(`Wake-word engine error. ${describe(e)}`);
    });

    const done = () => this.ttsDone?.();
    Tts.addEventListener('tts-finish', done);
    Tts.addEventListener('tts-cancel', done);

    try {
      await Tts.getInitStatus();
      try {
        await Tts.setDefaultLanguage('en-GB');
      } catch {
        await Tts.setDefaultLanguage('en-US');
      }
      Tts.setDefaultRate(0.5);
      Tts.setDefaultPitch(0.9);
      if (Platform.OS === 'ios') Tts.setIgnoreSilentSwitch('ignore');
    } catch (e: any) {
      if (e?.code === 'no_engine') Tts.requestInstallEngine();
      this.set({ error: 'Text-to-speech is unavailable. Install a TTS engine in system settings.' });
    }

    Sound.setCategory('Playback', true);
    this.activation = new Sound('activate.wav', Sound.MAIN_BUNDLE, err => {
      if (err) {
        console.warn('[JARVIS] activation sound not loaded', err);
        this.activation = null;
      }
    });
  }

  /* ───── wake word (Vosk, offline) ───── */
  private async startWakeWord() {
    if (this.wakeRunning) {
      this.set({ phase: 'idle' });
      return;
    }
    if (this.wakeBusy) return;
    this.wakeBusy = true;
    try {
      if (!this.voskLoaded) {
        await Vosk.loadModel(VOSK_MODEL_NAME); // first launch unpacks ~40 MB from the APK
        this.voskLoaded = true;
      }
      const ph = this.ph();
      if (ph === 'paused' || ph === 'error') return; // user paused while the model was loading
      await Vosk.start({ grammar: WAKE_GRAMMAR });
      this.wakeRunning = true;
      if (this.ph() === 'paused') {
        await this.stopWakeWord();
        return;
      }
      this.set({ phase: 'idle' });
    } catch (e) {
      this.fault(`Wake-word engine failed to start. ${describe(e)} (is the model in mobile/assets/${VOSK_MODEL_NAME}? run "npm run model")`);
    } finally {
      this.wakeBusy = false;
    }
  }

  private async stopWakeWord() {
    if (!this.wakeRunning) return;
    this.wakeRunning = false; // set first: ignores the final result Vosk emits after stop()
    try {
      Vosk.stop();
    } catch (e) {
      console.warn('[JARVIS] Vosk stop failed', e);
    }
  }

  /** Called for every partial/final hypothesis of the closed-vocabulary wake-word recognizer. */
  private onWakeText = (text: string) => {
    if (this.ph() !== 'idle' || !this.wakeRunning) return;
    const words = new Set((text || '').toLowerCase().split(/\s+/));
    if (WAKE_ALIASES.some(w => words.has(w))) this.beginCommand();
  };

  /* ───── flow: wake word heard (or orb tapped) → listen for the command ───── */
  private beginCommand = async () => {
    if (this.ph() !== 'idle') return;
    this.partial = '';
    this.set({ phase: 'recording', heard: '', error: null });

    await this.stopWakeWord(); // Vosk must release the mic before Voice can use it
    this.playActivation();
    await sleep(AUDIO_HANDOFF_MS);
    if (this.ph() !== 'recording') return; // cancelled / paused during the hand-off

    try {
      await Voice.start(toLocale(this.snap.lang), { EXTRA_PARTIAL_RESULTS: true });
      this.noSpeechTimer = setTimeout(() => {
        if (this.ph() === 'recording') this.returnToIdle();
      }, NO_SPEECH_TIMEOUT_MS);
    } catch (e) {
      this.set({ error: `Speech recognition failed to start. ${describe(e)}` });
      await this.returnToIdle();
    }
  };

  private playActivation() {
    const s = this.activation;
    if (s && s.isLoaded()) {
      s.stop(() => s.play());
    } else {
      Vibration.vibrate(60); // fallback if the sound file is missing
    }
  }

  /* ───── STT events ───── */
  private onPartial = (e: SpeechResultsEvent) => {
    if (this.ph() !== 'recording') return;
    const text = e.value?.[0] ?? '';
    if (!text) return;
    this.partial = text;
    this.set({ heard: text });
    if (this.noSpeechTimer) clearTimeout(this.noSpeechTimer);
    this.noSpeechTimer = null;
    // iOS never auto-ends, so we detect the end of the command ourselves
    if (this.silenceTimer) clearTimeout(this.silenceTimer);
    this.silenceTimer = setTimeout(() => this.finishWithText(this.partial), SILENCE_AFTER_SPEECH_MS);
  };

  private onResults = (e: SpeechResultsEvent) => {
    if (this.ph() !== 'recording') return;
    const text = (e.value?.[0] ?? this.partial).trim();
    if (text) this.finishWithText(text);
    else this.returnToIdle();
  };

  private onSpeechError = (e: SpeechErrorEvent) => {
    if (this.ph() !== 'recording') return; // errors from cancel() etc. are expected
    const msg = e.error?.message ?? '';
    if (this.partial.trim()) {
      this.finishWithText(this.partial); // we already heard something usable
      return;
    }
    // Android 5/6/7 = client / no speech / no match, iOS 1110 = no speech detected
    const benign = /^(5|6|7)\//.test(msg) || /no speech|no match|1110|didn't understand/i.test(msg);
    if (!benign) this.set({ error: `Speech recognition error: ${msg || 'unknown'}` });
    this.returnToIdle();
  };

  /* ───── flow: command captured → backend → TTS → back to wake word ───── */
  private async finishWithText(text: string) {
    if (this.ph() !== 'recording') return; // guards against double delivery
    this.clearTimers();
    this.set({ phase: 'thinking', heard: '', question: text, reply: '', error: null });
    try {
      await Voice.stop();
    } catch {
      /* already stopped */
    }

    let toSpeak: string;
    let speakLang = this.snap.lang;
    try {
      const result = await api.chat(text, await buildContext(), REQUEST_TIMEOUT_MS);
      if (this.ph() !== 'thinking') return; // paused while waiting

      // The assistant replies in the language you spoke; follow it for listening and speaking.
      if (result.lang) {
        this.setLanguage(result.lang);
        speakLang = result.lang;
      }
      for (const a of result.actions) {
        if (a.type === 'set_language') {
          this.setLanguage(a.lang);
          speakLang = a.lang;
        }
      }
      this.set({ phase: 'speaking', reply: result.reply });
      toSpeak = result.reply;

      // Timers, alarms, calls, apps... run alongside the spoken reply.
      device
        .runActions(result.actions)
        .then(problems => problems.length && this.set({ error: problems.join(' ') }))
        .catch(e => this.set({ error: describe(e) }));
    } catch (e) {
      if (this.ph() !== 'thinking') return;
      this.set({ phase: 'speaking', error: describe(e) });
      toSpeak = "I'm afraid I can't reach my servers at the moment.";
      speakLang = 'en';
    }

    await this.speak(toSpeak, speakLang);
    await this.returnToIdle(); // restarts Vosk (no-op if paused meanwhile)
  }

  /** Switches the speech recognizer + voice language (persisted). */
  private setLanguage(code: string) {
    const lang = code.slice(0, 2).toLowerCase();
    if (!lang || lang === this.snap.lang) return;
    this.set({ lang });
    saveLanguage(lang);
  }

  /** Language button: cycle through the configured languages. */
  cycleLanguage() {
    this.setLanguage(nextLanguage(this.snap.lang));
  }

  private async ensureTtsLanguage(lang: string): Promise<boolean> {
    const locale = toTtsLocale(lang);
    if (this.ttsLocale === locale) return true;
    for (const candidate of [locale, lang]) {
      try {
        await Tts.setDefaultLanguage(candidate);
        this.ttsLocale = locale;
        return true;
      } catch {
        /* try the next form */
      }
    }
    return false;
  }

  private async speak(text: string, lang: string): Promise<void> {
    if (!(await this.ensureTtsLanguage(lang))) {
      // keep showing the text, but explain why it is silent
      this.set({ error: `No "${lang}" voice is installed. Add one in Android Settings > Text-to-speech.` });
      await sleep(Math.min(6000, 1500 + text.length * 40)); // give the user time to read it
      return;
    }
    return this.speakNow(text);
  }

  private speakNow(text: string) {
    return new Promise<void>(resolve => {
      let done = false;
      let guard: ReturnType<typeof setTimeout>;
      const finish = () => {
        if (done) return;
        done = true;
        clearTimeout(guard);
        this.ttsDone = null;
        resolve();
      };
      this.ttsDone = finish; // resolved by tts-finish / tts-cancel events
      guard = setTimeout(finish, Math.max(8000, text.length * 120)); // never hang on a silent engine
      try {
        Tts.speak(text, {
          iosVoiceId: '',
          rate: 0.5,
          androidParams: { KEY_PARAM_PAN: 0, KEY_PARAM_VOLUME: 1, KEY_PARAM_STREAM: 'STREAM_MUSIC' },
        });
      } catch (e) {
        console.warn('[JARVIS] TTS speak failed', e);
        finish();
      }
    });
  }

  private async returnToIdle() {
    this.clearTimers();
    if (this.ph() === 'paused' || this.ph() === 'error' || this.ph() === 'booting') return;
    this.set({ phase: 'idle' });
    try {
      await Voice.cancel();
    } catch {
      /* nothing was running */
    }
    await sleep(AUDIO_HANDOFF_MS); // let the mic be released before Vosk grabs it
    if (this.ph() !== 'idle') return; // user tapped / paused during the wait
    await this.startWakeWord();
  }

  /* ───── helpers ───── */
  private clearTimers() {
    if (this.noSpeechTimer) clearTimeout(this.noSpeechTimer);
    if (this.silenceTimer) clearTimeout(this.silenceTimer);
    this.noSpeechTimer = null;
    this.silenceTimer = null;
  }

  private fault(message: string) {
    console.warn('[JARVIS]', message);
    this.clearTimers();
    Voice.cancel().catch(() => {});
    this.stopWakeWord().catch(() => {});
    stopListeningService().catch(() => {});
    KeepAlive.release();
    this.set({ phase: 'error', error: message });
  }
}

export const engine = new JarvisEngine();

/* ═════════════════ REACT BINDINGS ═════════════════ */
function useJarvis(): Snapshot {
  const snap = useSyncExternalStore(engine.subscribe, engine.getSnapshot);
  useEffect(() => {
    engine.autoStart();
  }, []);
  return snap;
}

/** Android may freeze background apps unless battery optimization is disabled for them. */
function useBatteryWarning(): boolean {
  const [needsFix, setNeedsFix] = useState(false);
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const check = async () => {
      try {
        setNeedsFix(await notifee.isBatteryOptimizationEnabled());
      } catch {
        /* unsupported device */
      }
    };
    check();
    const sub = AppState.addEventListener('change', s => {
      if (s === 'active') check(); // re-check after the user returns from Settings
    });
    return () => sub.remove();
  }, []);
  return needsFix;
}

async function openBatterySettings() {
  let hasOemScreen = false;
  try {
    const info = await notifee.getPowerManagerInfo();
    hasOemScreen = !!info.activity;
  } catch {
    /* ignore */
  }
  const buttons: Array<{ text: string; onPress?: () => void; style?: 'cancel' }> = [
    { text: 'Battery settings', onPress: () => notifee.openBatteryOptimizationSettings() },
  ];
  if (hasOemScreen) {
    buttons.push({ text: 'Manufacturer settings', onPress: () => notifee.openPowerManagerSettings() });
  }
  buttons.push({ text: 'Later', style: 'cancel' });
  Alert.alert(
    'Keep J.A.R.V.I.S. running',
    'Your phone may suspend the assistant when the screen is off. Set J.A.R.V.I.S. to "Unrestricted" / "Don\'t optimize" ' +
      'and allow auto-start / background activity if your phone has those options.',
    buttons,
  );
}

/* ═══════════════════════════════ UI ═══════════════════════════════ */
export default function App() {
  const { phase, heard, question, reply, error, lang } = useJarvis();
  const batteryWarn = useBatteryWarning();

  const meta = PHASE_META[phase];
  const transcript = phase === 'recording' ? heard : question;
  const online = phase === 'idle' || phase === 'recording' || phase === 'thinking' || phase === 'speaking';

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" />

      <View style={styles.header}>
        <Text style={[styles.title, { textShadowColor: meta.color }]}>J.A.R.V.I.S.</Text>
        <Text style={[styles.status, { color: meta.color }]}>{meta.label}</Text>
        <Pressable style={styles.langBtn} onPress={() => engine.cycleLanguage()} hitSlop={12}>
          <Text style={styles.pauseText}>🌐 {lang.toUpperCase()}</Text>
        </Pressable>
        {online && (
          <Pressable style={styles.pause} onPress={() => engine.pause()} hitSlop={12}>
            <Text style={styles.pauseText}>⏻ PAUSE</Text>
          </Pressable>
        )}
      </View>

      <View style={styles.center}>
        <Orb color={meta.color} phase={phase} onPress={() => engine.onOrbPress()} />
        <Text style={styles.hint}>{meta.hint}</Text>
      </View>

      <ScrollView style={styles.footer} contentContainerStyle={styles.footerContent}>
        {batteryWarn && online && (
          <Pressable onPress={openBatterySettings} style={styles.warnBox}>
            <Text style={styles.warnText}>
              ⚠ Battery optimization is ON. Android may stop listening when the screen is off. Tap to fix.
            </Text>
          </Pressable>
        )}
        {!!transcript && (
          <View style={[styles.bubble, { borderColor: '#00E5FF33' }]}>
            <Text style={styles.bubbleTag}>YOU ›</Text>
            <Text style={styles.bubbleText}>{transcript}</Text>
          </View>
        )}
        {!!reply && phase !== 'recording' && (
          <View style={[styles.bubble, { borderColor: '#B66DFF66', backgroundColor: '#B66DFF12' }]}>
            <Text style={[styles.bubbleTag, { color: '#B66DFF' }]}>JARVIS ›</Text>
            <Text style={styles.bubbleText}>{reply}</Text>
          </View>
        )}
        {!!error && <Text style={styles.error}>⚠ {error}</Text>}
      </ScrollView>
    </View>
  );
}

/* ═══════════════════════════════ ORB ═══════════════════════════════ */
function Orb({ color, phase, onPress }: { color: string; phase: Phase; onPress: () => void }) {
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const half = {
      paused: 2600, idle: 1800, booting: 1200, error: 1000, recording: 600, speaking: 500, thinking: 450,
    }[phase];
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: half, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: half, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [phase, pulse]);

  const outerScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.18] });
  const outerOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.9, 0.35] });
  const innerScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.08] });
  const bright = phase === 'recording' || phase === 'speaking';

  return (
    <Pressable onPress={onPress} hitSlop={20} accessibilityRole="button" style={styles.orbWrap}>
      <Animated.View
        style={[styles.halo, { width: 300, height: 300, borderRadius: 150, backgroundColor: color + '14',
          opacity: outerOpacity, transform: [{ scale: outerScale }] }]}
      />
      <Animated.View
        style={[styles.halo, { width: 236, height: 236, borderRadius: 118, backgroundColor: color + '22',
          transform: [{ scale: innerScale }] }]}
      />
      <View
        style={[styles.core, { borderColor: color, backgroundColor: color + (bright ? '40' : '1A'), shadowColor: color }]}
      >
        <View style={[styles.coreRing, { borderColor: color + '88' }]} />
        <View style={[styles.coreDot, { backgroundColor: color, shadowColor: color }]} />
      </View>
    </Pressable>
  );
}

/* ═══════════════════════════════ STYLES ═══════════════════════════════ */
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#02060D' },
  header: {
    alignItems: 'center',
    paddingTop: Platform.OS === 'ios' ? 64 : (StatusBar.currentHeight ?? 24) + 20,
  },
  title: {
    color: '#00E5FF',
    fontSize: 26,
    fontWeight: '200',
    letterSpacing: 10,
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 14,
  },
  status: { marginTop: 8, fontSize: 11, letterSpacing: 5, opacity: 0.85 },
  pause: {
    position: 'absolute',
    right: 18,
    top: Platform.OS === 'ios' ? 66 : (StatusBar.currentHeight ?? 24) + 22,
  },
  langBtn: {
    position: 'absolute',
    left: 18,
    top: Platform.OS === 'ios' ? 66 : (StatusBar.currentHeight ?? 24) + 22,
  },
  pauseText: { color: '#00E5FF88', fontSize: 10, letterSpacing: 2 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  orbWrap: { width: 300, height: 300, alignItems: 'center', justifyContent: 'center' },
  halo: { position: 'absolute' },
  core: {
    width: 170,
    height: 170,
    borderRadius: 85,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOpacity: 0.95,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 0 },
    elevation: 14,
  },
  coreRing: { position: 'absolute', width: 124, height: 124, borderRadius: 62, borderWidth: 1 },
  coreDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    shadowOpacity: 1,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 0 },
    elevation: 6,
  },
  hint: { marginTop: 18, color: '#7FB8C4', fontSize: 11, letterSpacing: 3, opacity: 0.7, minHeight: 16, textAlign: 'center' },
  footer: { maxHeight: 230 },
  footerContent: { paddingHorizontal: 20, paddingBottom: 34, gap: 10 },
  bubble: { borderWidth: 1, borderRadius: 8, padding: 12, backgroundColor: '#00E5FF0D' },
  bubbleTag: { color: '#00E5FF99', fontSize: 10, letterSpacing: 3, marginBottom: 4 },
  bubbleText: { color: '#D6F6FF', fontSize: 15, lineHeight: 21 },
  warnBox: { borderWidth: 1, borderColor: '#FFB30066', backgroundColor: '#FFB30012', borderRadius: 8, padding: 10 },
  warnText: { color: '#FFC94D', fontSize: 12, lineHeight: 17 },
  error: { color: '#FF6B81', fontSize: 12, textAlign: 'center', lineHeight: 18 },
});
