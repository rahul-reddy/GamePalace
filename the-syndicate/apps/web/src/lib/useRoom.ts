import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { RoomConnection, type Snapshot } from './connection';

const EMPTY: Snapshot = {
  status: { kind: 'connecting' },
  view: null,
  seq: 0,
  clockOffset: 0,
  pending: new Set(),
  lastError: null,
};

// Stable fallbacks so React does not resubscribe on every render without a seat.
const noSubscribe = () => () => {};
const emptySnapshot = () => EMPTY;

/** Opens (and closes) the room connection for one seat and exposes its live snapshot. */
export function useRoom(roomCode: string, token: string | null) {
  const connection = useMemo(
    () => (token ? new RoomConnection(roomCode, token) : null),
    [roomCode, token],
  );
  useEffect(() => {
    connection?.start();
    return () => connection?.stop();
  }, [connection]);
  const snapshot = useSyncExternalStore(
    connection?.subscribe ?? noSubscribe,
    connection?.getSnapshot ?? emptySnapshot,
  );
  return { connection, ...snapshot };
}
