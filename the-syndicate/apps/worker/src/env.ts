import type { RoomDirectory } from './directory';
import type { RateLimiter } from './limiter';
import type { Room } from './room';

export interface Env {
  ASSETS: Fetcher;
  ROOMS: DurableObjectNamespace<Room>;
  DIRECTORY: DurableObjectNamespace<RoomDirectory>;
  LIMITER: DurableObjectNamespace<RateLimiter>;
  ALLOWED_ORIGINS: string;
  TEST_MODE: string;
  /** Deployed commit, set by scripts/deploy.ps1; "dev" locally. */
  REVISION?: string;
}
