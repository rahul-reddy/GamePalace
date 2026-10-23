// Wire protocol between browser and room server. Every inbound message is parsed
// with these schemas before anything else looks at it; anything that does not parse
// is rejected with BAD_MESSAGE. Bump PROTOCOL_VERSION for incompatible changes.
import { AVATARS, REACTIONS, type PlayerView } from '@syndicate/game-engine';
import { z } from 'zod';

export const PROTOCOL_VERSION = 1;

/** Characters used in room codes: no 0/O or 1/I/L to avoid misreading. */
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const ROOM_CODE_LENGTH = 6;
export const RoomCode = z
  .string()
  .transform((s) => s.trim().toUpperCase())
  .pipe(z.string().regex(new RegExp(`^[${ROOM_CODE_ALPHABET}]{${ROOM_CODE_LENGTH}}$`)));

const Id = z
  .string()
  .min(1)
  .max(40)
  .regex(/^[A-Za-z0-9_-]+$/);
const Nickname = z.string().min(1).max(40);
const Avatar = z.enum(AVATARS);

export const MatchSettingsInput = z
  .object({
    length: z.enum(['standard', 'quick']),
    pace: z.enum(['fast', 'normal', 'relaxed']),
    beginner: z.boolean(),
    presetChatOnly: z.boolean(),
  })
  .partial()
  .strict();

const DealTermInput = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('commit'), amount: z.number().int().min(1).max(3) }).strict(),
  z.object({ kind: z.literal('shareIntel') }).strict(),
  z.object({ kind: z.literal('noAccuse') }).strict(),
  z.object({ kind: z.literal('backNext') }).strict(),
]);

export const PlayerCommandInput = z.discriminatedUnion('type', [
  z.object({ type: z.literal('setReady'), ready: z.boolean() }).strict(),
  z.object({ type: z.literal('updateSettings'), settings: MatchSettingsInput }).strict(),
  z.object({ type: z.literal('start') }).strict(),
  z.object({ type: z.literal('kick'), target: Id }).strict(),
  z.object({ type: z.literal('mute'), target: Id, muted: z.boolean() }).strict(),
  z.object({ type: z.literal('leave') }).strict(),
  z.object({ type: z.literal('buyIntel') }).strict(),
  z.object({ type: z.literal('commit'), amount: z.number().int().min(0).max(3) }).strict(),
  z
    .object({
      type: z.literal('proposeDeal'),
      invitees: z.array(Id).min(1).max(11),
      terms: z.array(DealTermInput).min(1).max(3),
      note: z.string().max(160),
    })
    .strict(),
  z.object({ type: z.literal('respondDeal'), dealId: Id, accept: z.boolean() }).strict(),
  z
    .object({
      type: z.literal('chat'),
      kind: z.enum(['text', 'preset', 'reaction']),
      text: z.string().min(1).max(280),
    })
    .strict(),
  z.object({ type: z.literal('rematch') }).strict(),
  z
    .object({
      type: z.literal('useAbility'),
      target: Id.optional(),
      choice: z.enum(['current', 'next', 'SUCCESS', 'FAILURE']).optional(),
      targetRound: z.number().int().min(1).max(10).optional(),
    })
    .strict(),
  z.object({ type: z.literal('accuse'), target: Id }).strict(),
]);
export type PlayerCommandInput = z.infer<typeof PlayerCommandInput>;

const CommandId = z
  .string()
  .min(8)
  .max(64)
  .regex(/^[A-Za-z0-9_-]+$/);

export const ClientMessage = z.discriminatedUnion('type', [
  z
    .object({
      v: z.literal(PROTOCOL_VERSION),
      type: z.literal('hello'),
      token: z.string().min(20).max(200),
      /** Last server sequence number the client applied, for resync diagnostics. */
      lastSeq: z.number().int().min(0).optional(),
    })
    .strict(),
  z
    .object({
      v: z.literal(PROTOCOL_VERSION),
      type: z.literal('cmd'),
      commandId: CommandId,
      /** Phase version the client saw; commands from an earlier phase are refused as STALE_PHASE. */
      expectedPhaseVersion: z.number().int().min(0).optional(),
      command: PlayerCommandInput,
    })
    .strict(),
  z.object({ v: z.literal(PROTOCOL_VERSION), type: z.literal('ping'), t: z.number() }).strict(),
]);
export type ClientMessage = z.infer<typeof ClientMessage>;

export const PROTOCOL_ERRORS = [
  'BAD_MESSAGE',
  'UNSUPPORTED_VERSION',
  'UNAUTHORIZED',
  'RATE_LIMITED',
  'STALE_PHASE',
  'ROOM_NOT_FOUND',
  'ROOM_CLOSED',
  'REPLACED',
  'KICKED',
  'SERVER_ERROR',
] as const;
export type ProtocolErrorCode = (typeof PROTOCOL_ERRORS)[number];

export interface ErrorBody {
  code: string;
  message: string;
}

export type ServerMessage =
  | { v: 1; type: 'welcome'; playerId: string; roomCode: string; serverTime: number }
  | { v: 1; type: 'state'; seq: number; serverTime: number; view: PlayerView }
  | { v: 1; type: 'ack'; commandId: string; ok: true; seq: number; duplicate?: boolean }
  | { v: 1; type: 'ack'; commandId: string; ok: false; error: ErrorBody }
  | { v: 1; type: 'error'; error: ErrorBody; fatal: boolean }
  | { v: 1; type: 'pong'; t: number; serverTime: number };

// ---- HTTP -------------------------------------------------------------------

export const CreateRoomRequest = z
  .object({ name: Nickname, avatar: Avatar, settings: MatchSettingsInput.optional() })
  .strict();
export const JoinRoomRequest = z.object({ name: Nickname, avatar: Avatar }).strict();

export interface SeatResponse {
  roomCode: string;
  playerId: string;
  /** Secret seat credential. Stored only on this device; never put it in a shareable link. */
  token: string;
}

export interface RoomSummary {
  roomCode: string;
  phase: string;
  players: number;
  maxPlayers: number;
  joinable: boolean;
}

export interface HealthResponse {
  ok: true;
  service: 'the-syndicate';
  protocol: number;
  rules: string;
  time: number;
}

/** Close codes used on room sockets (4000-4999 are application-defined). */
export const CLOSE = {
  AUTH_TIMEOUT: 4000,
  REPLACED: 4001,
  UNAUTHORIZED: 4003,
  KICKED: 4004,
  ROOM_CLOSED: 4010,
  RATE_LIMITED: 4029,
  BAD_MESSAGE: 4400,
} as const;

export { REACTIONS };
