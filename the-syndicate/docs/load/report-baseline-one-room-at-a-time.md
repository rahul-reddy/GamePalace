# Load test report

- Target: http://127.0.0.1:8794 (local wrangler dev started by this script)
- Machine: win32, Node v24.13.0; client and server share this machine
- Rooms: 9 (72 players, 1 rooms in flight at once), 2 round(s) each
- Failed rooms: 0; rejected commands: 0; wall time 22.4 s

| Measure (ms) | Samples | p50 | p95 | p99 | max |
| --- | ---: | ---: | ---: | ---: | ---: |
| ack | 994 | 47.0 | 118.9 | 243.7 | 259.4 |
| fanout | 99 | 70.6 | 155.0 | 264.9 | 264.9 |
| join | 72 | 63.5 | 217.2 | 264.9 | 264.9 |
| connect | 72 | 60.3 | 91.1 | 265.3 | 265.3 |

`ack`: command sent until its acknowledgement. `fanout`: last player done until every player in the room has the next phase. `join`: create/join HTTP request. `connect`: socket open + hello until first state.

Local numbers measure the code path, not Cloudflare production latency (no network distance, one machine for client and server).