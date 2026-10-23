import type { Avatar, MatchSettings } from '@syndicate/game-engine';
import type { RoomSummary, SeatResponse } from '@syndicate/shared';

export class ApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      ...init,
      headers: { 'content-type': 'application/json', ...init?.headers },
    });
  } catch {
    throw new ApiError('OFFLINE', 'Could not reach the server. Check your connection.', 0);
  }
  const body = (await response.json().catch(() => null)) as
    (T & { error?: { code: string; message: string } }) | null;
  if (!response.ok) {
    throw new ApiError(
      body?.error?.code ?? 'SERVER_ERROR',
      body?.error?.message ?? 'Something went wrong. Please try again.',
      response.status,
    );
  }
  return body as T;
}

export function createRoom(
  name: string,
  avatar: Avatar,
  settings: Partial<MatchSettings>,
): Promise<SeatResponse> {
  return call('/api/rooms', { method: 'POST', body: JSON.stringify({ name, avatar, settings }) });
}

export function joinRoom(code: string, name: string, avatar: Avatar): Promise<SeatResponse> {
  return call(`/api/rooms/${encodeURIComponent(code)}/join`, {
    method: 'POST',
    body: JSON.stringify({ name, avatar }),
  });
}

export function getRoom(code: string): Promise<RoomSummary> {
  return call(`/api/rooms/${encodeURIComponent(code)}`);
}
