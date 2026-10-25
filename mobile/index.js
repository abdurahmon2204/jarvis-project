/**
 * @format
 */
import { AppRegistry, DeviceEventEmitter } from 'react-native';
import notifee, { EventType } from '@notifee/react-native';
import App from './App'; // importing App also creates the JarvisEngine singleton
import { name as appName } from './app.json';

// 1) The foreground-service "task". It must be registered OUTSIDE React, at app entry.
//    Returning a promise that never resolves keeps the service (and the process) alive
//    until notifee.stopForegroundService() is called.
notifee.registerForegroundService(() => new Promise(() => {}));

// 2) Notification button handling. Works with the UI closed and the screen locked.
const onNotificationEvent = async ({ type, detail }) => {
  const id = detail.pressAction?.id;
  const n = detail.notification;
  if (type === EventType.ACTION_PRESS) {
    if (id === 'stop') DeviceEventEmitter.emit('JARVIS_STOP_REQUESTED');
    if (id === 'talk') DeviceEventEmitter.emit('JARVIS_TALK_REQUESTED'); // manual "Speak" button
    if (id === 'dismiss' && n?.id) await notifee.cancelNotification(n.id); // stop a ringing timer/alarm
  }
  if (type === EventType.PRESS && id === 'run_action' && n?.data?.jarvisAction) {
    // "Tap to call / open ..." notification: the engine performs it as soon as the app is on screen
    DeviceEventEmitter.emit('JARVIS_RUN_ACTION', n.data.jarvisAction);
  }
};
notifee.onBackgroundEvent(onNotificationEvent);
notifee.onForegroundEvent(onNotificationEvent);

AppRegistry.registerComponent(appName, () => App);
