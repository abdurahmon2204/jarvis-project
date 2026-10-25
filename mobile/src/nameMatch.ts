// Pure name-matching helpers (no React Native imports, so they are unit-testable in plain Node).
// Speech recognizers return names in whatever script the active language uses ("Алишер"), while the
// phonebook may say "Alisher". Everything is transliterated to plain Latin before comparing.
const CYR: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'j', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l',
  м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'c', ч: 'ch', ш: 'sh',
  щ: 'sh', ъ: '', ы: 'i', ь: '', э: 'e', ю: 'yu', я: 'ya', ў: 'u', қ: 'q', ғ: 'g', ҳ: 'h',
};
export const normalizeName = (s: string): string =>
  s.toLowerCase().split('').map(ch => CYR[ch] ?? ch).join('').replace(/[^a-z0-9]+/g, ' ').trim();

const lev = (a: string, b: string): number => {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)] as number[]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
  }
  return dp[a.length][b.length];
};

/** 0..1 similarity between a spoken name and a phonebook name (both normalized). */
export const nameScore = (query: string, name: string): number => {
  if (!query || !name) return 0;
  if (name === query) return 1;
  const qw = query.split(' '), nw = name.split(' ');
  if (name.startsWith(query) || nw.includes(query)) return 0.9;
  if (name.includes(query)) return 0.75;
  let best = 0;
  for (const q of qw) for (const n of nw) best = Math.max(best, 1 - lev(q, n) / Math.max(q.length, n.length));
  return best >= 0.75 ? best * 0.8 : 0;
};

