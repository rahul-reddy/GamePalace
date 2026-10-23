// Secure randomness and hashing for the server. Everything secret (seat tokens,
// match seeds, internal ids) comes from crypto.getRandomValues.
import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH } from '@syndicate/shared';

function randomBytes(n: number): Uint8Array {
  const bytes = new Uint8Array(n);
  crypto.getRandomValues(bytes);
  return bytes;
}

function base64url(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function hex(bytes: Uint8Array): string {
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** 256-bit bearer credential for one seat. */
export function newToken(): string {
  return base64url(randomBytes(32));
}

/** 256-bit match seed for the engine's deterministic RNG. */
export function newSeed(): string {
  return hex(randomBytes(32));
}

/** Public, non-secret player id. */
export function newPlayerId(): string {
  return `p_${base64url(randomBytes(9))}`;
}

/** Unbiased room code (rejection sampling over the code alphabet). */
export function newRoomCode(): string {
  const n = ROOM_CODE_ALPHABET.length;
  const limit = 256 - (256 % n);
  let out = '';
  while (out.length < ROOM_CODE_LENGTH) {
    for (const b of randomBytes(16)) {
      if (b < limit && out.length < ROOM_CODE_LENGTH) out += ROOM_CODE_ALPHABET[b % n];
    }
  }
  return out;
}

export async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return hex(new Uint8Array(digest));
}

/** Constant-time comparison of equal-length hex strings. */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
