import { describe, expect, it } from 'vitest';
import { ClientMessage, CreateRoomRequest, PlayerCommandInput, RoomCode } from '../src';

describe('protocol schemas', () => {
  it('accepts well-formed messages', () => {
    expect(ClientMessage.safeParse({ v: 1, type: 'hello', token: 'x'.repeat(43) }).success).toBe(
      true,
    );
    expect(
      ClientMessage.safeParse({
        v: 1,
        type: 'cmd',
        commandId: 'abc12345',
        expectedPhaseVersion: 3,
        command: { type: 'commit', amount: 2 },
      }).success,
    ).toBe(true);
    expect(ClientMessage.safeParse({ v: 1, type: 'ping', t: 5 }).success).toBe(true);
  });

  it('rejects wrong versions, unknown fields and out-of-range values', () => {
    const bad = [
      { v: 2, type: 'ping', t: 1 },
      { v: 1, type: 'hello', token: 'short' },
      { v: 1, type: 'cmd', commandId: 'abc', command: { type: 'commit', amount: 1 } },
      { v: 1, type: 'cmd', commandId: 'abc12345', command: { type: 'commit', amount: 4 } },
      { v: 1, type: 'cmd', commandId: 'abc12345', command: { type: 'commit', amount: 1.5 } },
      {
        v: 1,
        type: 'cmd',
        commandId: 'abc12345',
        command: { type: 'commit', amount: 1, extra: true },
      },
      { v: 1, type: 'cmd', commandId: 'abc 12345', command: { type: 'start' } },
      { v: 1, type: 'cmd', commandId: 'abc12345', command: { type: 'tick' } },
      {
        v: 1,
        type: 'cmd',
        commandId: 'abc12345',
        command: { type: 'join', playerId: 'x', name: 'y', avatar: 'fox' },
      },
      {
        v: 1,
        type: 'cmd',
        commandId: 'abc12345',
        command: { type: 'chat', kind: 'text', text: 'x'.repeat(281) },
      },
      { v: 1, type: 'cmd', commandId: 'abc12345', command: { type: 'start' }, seed: 'mine' },
      { v: 1, type: 'teleport' },
      'not an object',
      null,
    ];
    for (const message of bad)
      expect([message, ClientMessage.safeParse(message).success]).toEqual([message, false]);
  });

  it('never lets a client supply seeds, actors or system commands', () => {
    for (const type of ['join', 'presence', 'tick']) {
      expect(PlayerCommandInput.safeParse({ type }).success).toBe(false);
    }
  });

  it('normalizes room codes and rejects ambiguous characters', () => {
    expect(RoomCode.parse(' k7qf2m ')).toBe('K7QF2M');
    expect(RoomCode.safeParse('K7QF2O').success).toBe(false);
    expect(RoomCode.safeParse('K7QF2').success).toBe(false);
    expect(RoomCode.safeParse('K7QF2M1').success).toBe(false);
  });

  it('validates room creation input', () => {
    expect(CreateRoomRequest.safeParse({ name: 'Ada', avatar: 'fox' }).success).toBe(true);
    expect(CreateRoomRequest.safeParse({ name: 'Ada', avatar: 'dragon' }).success).toBe(false);
    expect(CreateRoomRequest.safeParse({ name: '', avatar: 'fox' }).success).toBe(false);
    expect(
      CreateRoomRequest.safeParse({ name: 'Ada', avatar: 'fox', settings: { length: 'epic' } })
        .success,
    ).toBe(false);
  });
});
