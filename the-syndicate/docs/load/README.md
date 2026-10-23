# Load test results (2026-10-23)

Both runs: `scripts/load-test.ts` against a local `wrangler dev` (workerd) started by the script,
on one Windows 11 machine that also runs the load client (Node 24). Real WebSockets, real Durable
Objects with SQLite storage, rules 2.0.0, relaxed pace, every player acting at the same instant
in each phase. Commands per room: readiness, intel purchases, preset chat, sealed commitments.

| Run | Rooms (players) | In flight | Failed rooms | Rejected | ack p50 / p95 / p99 | phase fan-out p95 |
| --- | ---: | ---: | ---: | ---: | --- | ---: |
| [Baseline](report-baseline-one-room-at-a-time.md) | 9 (72) | 1 room | 0 | 0 | 47 / 119 / 244 ms | 155 ms |
| [100 rooms](report-100-rooms.md) | 100 (796) | 25 rooms | 0 | 0 | 865 / 1,656 / 2,391 ms | 1,878 ms |

Reading the numbers:

- **Correctness under load holds:** 796 simultaneous players across 100 rooms, every room finished
  its rounds, no command was rejected, no room failed.
- **The 250 ms p95 acknowledgement target is met for an uncontended room** (119 ms p95) even when
  a whole table acts in the same instant.
- **Under 25 concurrent rooms the local p95 is 1.7 s.** Locally every Durable Object of every
  room runs inside one `workerd` process on the same machine as an 800-socket client, so rooms
  compete for one CPU. On Cloudflare each room's Durable Object runs independently, so this run
  measures the local machine, not production capacity. Trimming the per-player view by 25%
  (older deals) did not change these numbers, which is consistent with CPU contention rather
  than payload size.
- **Not measured:** production or staging latency (nothing is deployed). Running
  `SYNDICATE_BASE_URL=https://<staging-host> pnpm test:load` against staging (with `TEST_MODE=1`
  only on a dedicated load environment, since the client needs the test-only rate-limit identity)
  is the required next measurement before any production capacity claim.
