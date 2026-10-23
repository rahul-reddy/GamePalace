# Load test report

- Target: http://127.0.0.1:8794 (local wrangler dev started by this script)
- Machine: win32, Node v24.13.0; client and server share this machine
- Rooms: 100 (796 players, 25 rooms in flight at once), 2 round(s) each
- Failed rooms: 0; rejected commands: 0; wall time 206.6 s

| Measure (ms) | Samples | p50 | p95 | p99 | max |
| --- | ---: | ---: | ---: | ---: | ---: |
| ack | 10990 | 864.5 | 1655.9 | 2390.6 | 3480.3 |
| fanout | 1100 | 1050.4 | 1877.5 | 2768.7 | 3544.4 |
| join | 796 | 1070.3 | 2565.4 | 3351.6 | 4533.4 |
| connect | 796 | 2526.6 | 4349.2 | 6089.3 | 6822.4 |

`ack`: command sent until its acknowledgement. `fanout`: last player done until every player in the room has the next phase. `join`: create/join HTTP request. `connect`: socket open + hello until first state.

Local numbers measure the code path, not Cloudflare production latency (no network distance, one machine for client and server).