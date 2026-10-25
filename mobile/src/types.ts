export type ScheduleKind = 'timer' | 'alarm' | 'reminder';

export type Action =
  | { type: 'schedule'; id: string; kind: ScheduleKind; atMs: number; label: string; repeat: 'none' | 'daily' | 'weekly' }
  | { type: 'cancel'; ids: string[] }
  | { type: 'call'; name?: string; number?: string }
  | { type: 'message'; channel: 'sms' | 'whatsapp'; name?: string; number?: string; text: string }
  | { type: 'open_app'; name: string }
  | { type: 'open_url'; url: string }
  | { type: 'navigate'; destination: string }
  | { type: 'music'; query: string }
  | { type: 'set_language'; lang: string };

export type ScheduledItem = { id: string; label: string; atMs: number; kind: ScheduleKind };

export type ChatContext = {
  platform: 'android';
  tzOffsetMin: number;
  timezone: string;
  scheduled: ScheduledItem[];
};

export type ChatResult = { reply: string; lang?: string; actions: Action[] };
