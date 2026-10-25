import weather from "./weather.js";
import search from "./search.js";
import { remember, forget } from "./memory.js";
import { addNote, listNotes, deleteNote } from "./notes.js";
import * as d from "./device.js";

export const TOOLS = [
  weather, search, remember, forget, addNote, listNotes, deleteNote,
  d.setTimer, d.setAlarm, d.setReminder, d.cancelScheduled,
  d.callContact, d.sendMessage, d.openApp, d.openLink, d.navigate, d.playMusic, d.setLanguage,
];

/** A browser can't set phone alarms or open apps, so it only gets tools marked `webOk`. */
export const toolsFor = (platform) => TOOLS.filter((t) => platform !== "web" || t.webOk);
