import type { Avatar, Phase, Tier } from '@syndicate/game-engine';
import { useEffect, useState } from 'react';

export const AVATAR_GLYPH: Record<Avatar, string> = {
  fox: '🦊',
  owl: '🦉',
  raven: '🐦',
  wolf: '🐺',
  cat: '🐱',
  stag: '🦌',
  viper: '🐍',
  moth: '🦋',
  hare: '🐇',
  bear: '🐻',
  lynx: '🐆',
  crane: '🦢',
};

export const PHASE_LABEL: Record<Phase, string> = {
  LOBBY: 'Lobby',
  ROLE_REVEAL: 'Briefing',
  INTELLIGENCE: 'Intelligence',
  NEGOTIATION: 'Negotiation',
  COMMITMENT: 'Sealed commitment',
  RESOLUTION: 'Outcome',
  ROUND_SUMMARY: 'Round summary',
  FINAL_RECKONING: 'Final reckoning',
  RESULTS: 'Results',
};

export const PHASE_HINT: Record<Phase, string> = {
  LOBBY: 'Share the code. Everyone marks Ready, then the host starts.',
  ROLE_REVEAL: 'Read your briefing, then press Ready.',
  INTELLIGENCE: 'Study the operation and your private intel.',
  NEGOTIATION: 'Talk, bluff and make deals. Promises are not enforced.',
  COMMITMENT: 'Seal 0-3 credits. Nobody sees amounts until the reveal.',
  RESOLUTION: 'The operation resolves. Commitments are revealed.',
  ROUND_SUMMARY: 'See who kept their word.',
  FINAL_RECKONING: 'Scores, ranks and the full audit.',
  RESULTS: 'The match is over.',
};

export const TIER_LABEL: Record<Tier, string> = {
  LOW: 'Low risk',
  MEDIUM: 'Medium risk',
  HIGH: 'High risk',
};

export function pct(x: number): string {
  return `${Math.round(x * 100)}%`;
}

export function signedPts(x: number): string {
  const v = Math.round(x * 100);
  return v === 0 ? '±0' : v > 0 ? `+${v}` : `${v}`;
}

/** Re-renders every `ms` and returns the current server-adjusted time. */
export function useServerNow(clockOffset: number, ms = 250): number {
  const [now, setNow] = useState(() => Date.now() + clockOffset);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now() + clockOffset), ms);
    return () => clearInterval(id);
  }, [clockOffset, ms]);
  return now;
}
