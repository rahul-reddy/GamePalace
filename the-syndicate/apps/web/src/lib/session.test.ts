import { describe, expect, it } from 'vitest';
import { decodeSeat, encodeSeat } from './session';

describe('seat transfer encoding', () => {
  it('round-trips seats with any Unicode name, URL-safe and unpadded', () => {
    const seat = {
      roomCode: 'K7QF2M',
      playerId: 'p_abc-123',
      token: 'x'.repeat(43),
      name: 'Zoë 🦊 Ünal',
    };
    for (let i = 0; i < 4; i++) {
      const s = { ...seat, name: seat.name + 'a'.repeat(i) };
      const text = encodeSeat(s);
      expect(text).toMatch(/^[A-Za-z0-9_-]+$/);
      expect(decodeSeat(text)).toEqual(s);
    }
  });

  it('rejects malformed or incomplete seats', () => {
    expect(decodeSeat('not base64 !')).toBeNull();
    expect(
      decodeSeat(encodeSeat({ roomCode: 'K7QF2M', playerId: 'p', token: 't' } as never)),
    ).toBeNull();
  });
});
