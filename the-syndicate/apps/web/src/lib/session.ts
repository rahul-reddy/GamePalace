// Seat credentials live in localStorage, keyed by room code, so a refresh, a closed
// tab or a browser restart can rejoin the same seat. They are never put in URLs.
// Storage can be unavailable (private mode, blocked site data); an in-memory map
// keeps the current tab working in that case.

export interface StoredSeat {
  roomCode: string;
  playerId: string;
  token: string;
  name: string;
}

const PREFIX = 'syndicate.seat.';
const memory = new Map<string, string>();

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return memory.get(key) ?? null;
  }
}

function write(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    if (value === null) memory.delete(key);
    else memory.set(key, value);
  }
}

export function loadSeat(roomCode: string): StoredSeat | null {
  const raw = read(PREFIX + roomCode.toUpperCase());
  if (!raw) return null;
  try {
    const seat = JSON.parse(raw) as StoredSeat;
    return typeof seat.token === 'string' && typeof seat.playerId === 'string' ? seat : null;
  } catch {
    return null;
  }
}

export function saveSeat(seat: StoredSeat): void {
  write(PREFIX + seat.roomCode.toUpperCase(), JSON.stringify(seat));
}

export function forgetSeat(roomCode: string): void {
  write(PREFIX + roomCode.toUpperCase(), null);
}

const PROFILE_KEY = 'syndicate.profile';

export function loadProfile(): { name: string; avatar: string } | null {
  const raw = read(PROFILE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as { name: string; avatar: string };
  } catch {
    return null;
  }
}

export function saveProfile(profile: { name: string; avatar: string }): void {
  write(PROFILE_KEY, JSON.stringify(profile));
}

const SOUND_KEY = 'syndicate.sound';
export function loadSoundEnabled(): boolean {
  return read(SOUND_KEY) === 'on';
}
export function saveSoundEnabled(on: boolean): void {
  write(SOUND_KEY, on ? 'on' : 'off');
}

// ---- Moving a seat to another device ----------------------------------------

export function encodeSeat(seat: StoredSeat): string {
  // UTF-8 bytes -> base64url (names can contain any Unicode).
  const bytes = new TextEncoder().encode(JSON.stringify(seat));
  return btoa(Array.from(bytes, (b) => String.fromCharCode(b)).join(''))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export function decodeSeat(text: string): StoredSeat | null {
  try {
    const b64 = text.replace(/-/g, '+').replace(/_/g, '/');
    const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
    const binary = atob(padded);
    const json = new TextDecoder().decode(Uint8Array.from(binary, (c) => c.charCodeAt(0)));
    const seat = JSON.parse(json) as StoredSeat;
    const ok =
      typeof seat.roomCode === 'string' &&
      typeof seat.playerId === 'string' &&
      typeof seat.token === 'string' &&
      typeof seat.name === 'string';
    return ok ? seat : null;
  } catch {
    return null;
  }
}

/** A private link that opens this seat elsewhere; the seat rides in the URL fragment. */
export function transferLink(roomCode: string): string | null {
  const seat = loadSeat(roomCode);
  return seat ? `${location.origin}/room/${seat.roomCode}#seat=${encodeSeat(seat)}` : null;
}

/**
 * Stores a seat arriving in the URL fragment and removes it from the address bar
 * (and history) before anything else can read or share it.
 */
export function acceptTransferredSeat(roomCode: string): void {
  const match = /^#seat=([A-Za-z0-9_-]+)$/.exec(location.hash);
  if (!match) return;
  history.replaceState(null, '', location.pathname);
  const seat = decodeSeat(match[1] as string);
  if (seat && seat.roomCode.toUpperCase() === roomCode.toUpperCase()) saveSeat(seat);
}
