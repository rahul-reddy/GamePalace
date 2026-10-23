// Text normalization and the profanity filter shared by names, chat and deal notes.
// The filter is intentionally simple (whole-word masking with common substitutions);
// hosts can also mute players and switch the room to preset-only chat.

export const PRESET_MESSAGES: Record<string, string> = {
  in3: "I'm in for 3.",
  in2: "I'm in for 2.",
  in1: "I'll put in 1.",
  out: "I'm sitting this one out.",
  target: "Let's hit the target together.",
  intelGood: 'My intel looks good.',
  intelBad: 'My intel says this is risky.',
  trust: 'Trust me.',
  noTrust: "I don't trust this.",
  deal: 'Want to make a deal?',
  suspicious: 'Someone here is playing both sides.',
  wellPlayed: 'Well played.',
};

export const REACTIONS = ['👍', '👎', '🤝', '🤔', '😏', '😱', '🔥', '🕵️'] as const;

const BLOCKED_WORDS = [
  'fuck',
  'shit',
  'bitch',
  'cunt',
  'dick',
  'cock',
  'pussy',
  'asshole',
  'bastard',
  'slut',
  'whore',
  'fag',
  'faggot',
  'nigger',
  'nigga',
  'retard',
  'kike',
  'spic',
  'chink',
  'tranny',
];

const LEET: Record<string, string> = {
  '0': 'o',
  '1': 'i',
  '3': 'e',
  '4': 'a',
  '5': 's',
  '7': 't',
  '@': 'a',
  $: 's',
};

function unleet(word: string): string {
  return word
    .toLowerCase()
    .split('')
    .map((ch) => LEET[ch] ?? ch)
    .join('')
    .replace(/[^a-z]/g, '');
}

function canonical(word: string): string {
  return unleet(word).replace(/(.)\1+/g, '$1');
}

// Stems blocked even inside longer words ("fuckers", "bitches"). Only stems that
// do not occur inside ordinary words belong here: "spic" (spicy), "cock" (peacock)
// and "dick" (Dickens) are matched as whole words only.
// Collapsed stems are checked after repeated letters are squeezed ("fuuuck");
// raw stems need their double letter so "night" and "fagin" stay clean.
const COLLAPSED_STEMS = ['fuck', 'shit', 'bitch', 'whore', 'slut', 'retard'];
const RAW_STEMS = ['nigg', 'fagg', 'asshole'];

const BLOCKED = new Set(BLOCKED_WORDS.map(canonical));

function isBlocked(word: string): boolean {
  const c = canonical(word);
  if (c.length === 0) return false;
  if (BLOCKED.has(c)) return true;
  if (BLOCKED.has(c.replace(/(es|s)$/, ''))) return true;
  if (COLLAPSED_STEMS.some((stem) => c.includes(stem))) return true;
  const raw = unleet(word);
  return RAW_STEMS.some((stem) => raw.includes(stem));
}

/** Strips control and formatting characters and collapses whitespace. */
export function normalizeText(input: string): string {
  return input
    .normalize('NFKC')
    .replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function filterProfanity(input: string): string {
  return input.replace(/[\p{L}\p{N}@$]+/gu, (word) =>
    isBlocked(word) ? '*'.repeat(word.length) : word,
  );
}

export function containsProfanity(input: string): boolean {
  return filterProfanity(input) !== input;
}

export const NAME_MIN = 1;
export const NAME_MAX = 16;

/** Returns a cleaned display name, or null when nothing acceptable remains. */
export function cleanName(input: string): string | null {
  const name = normalizeText(input).slice(0, NAME_MAX).trim();
  if (name.length < NAME_MIN) return null;
  if (containsProfanity(name)) return null;
  return name;
}
