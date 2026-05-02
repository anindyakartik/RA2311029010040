# RA2311029010040 — Backend Evaluation

Three independent backend problems built with plain Node.js and no frameworks.

---

## Structure

```
logging_middleware/          Problem 1 – shared logging package
vehicle_maintenance_scheduler/   Problem 2 – optimisation microservice
notification_app_be/         Problem 3 – campus notification service
notification_system_design.md    Full design document (Stages 1–6)
```

---

## Problem 1 — Logging Middleware

A reusable package that every other module imports. Exposes a single function:

```js
Log(stack, level, package, message)
```

Internally sends a POST to the evaluation server with the log payload. No `console.log` is used anywhere in this project — every log goes through this middleware.

**Valid values:**

| Field | Options |
|-------|---------|
| stack | `backend`, `frontend` |
| level | `debug`, `info`, `warn`, `error`, `fatal` |
| package | `cache`, `controller`, `cron_job`, `db`, `domain`, `handler`, `repository`, `route`, `service`, `auth`, `config`, `middleware`, `utils` |

---

## Problem 2 — Vehicle Maintenance Scheduler

A logistics depot has a fixed daily mechanic-hour budget. Given a pool of vehicles — each with a `Duration` (hours) and an `Impact` (importance score) — the service picks the subset that maximises total impact without exceeding the budget. Classic bounded knapsack, implemented from scratch using bottom-up dynamic programming.

**Running it:**

```bash
cd vehicle_maintenance_scheduler
npm install
node src/server.js
```

**Endpoints:**

```
GET  /schedule?depotID=2   # returns optimal vehicle set for that depot
GET  /health
```

The service fetches live depot and vehicle data on every request — nothing is hardcoded.

Postman screenshots showing the request, full response, and response time are in the `vehicle_maintenance_scheduler/` folder.

---

## Problem 3 — Campus Notification Service

Handles real-time notification delivery for Placements, Events, and Results. The full system design is in `notification_system_design.md` and covers six stages:

- Stage 1: REST API design with SSE for real-time delivery
- Stage 2: PostgreSQL schema with indexing strategy
- Stage 3: Query analysis and optimisation at scale
- Stage 4: Redis caching with write-through invalidation
- Stage 5: Bulk notification reliability using message queues
- Stage 6: Priority inbox implementation

**Stage 6 — Priority Inbox (working code)**

Surfaces the top N most important unread notifications. Priority is determined by type weight (Placement > Result > Event) and recency within the same type.

The algorithm uses a **bounded min-heap** of size N. Rather than sorting the full list in O(m log m), it processes notifications in O(m log N) and holds only N items in memory at any point. Each notification gets a composite score:

```
score = typeWeight × 10^15 + timestamp_ms
```

This collapses both priority dimensions into a single number so the heap only needs one comparison per item.

**Running it:**

```bash
cd notification_app_be
npm install

# CLI mode
node src/priorityInbox.js 10

# HTTP mode
node src/server.js
# GET http://localhost:5000/priority-inbox?n=10
```

Postman screenshot is in the `notification_app_be/` folder.

---

## Auth

All requests to the evaluation server use a Bearer token obtained by calling the `/auth` endpoint with the registered `clientID` and `clientSecret`. The token is set in `src/config.js` in each module.

---

## Notes

- Zero external dependencies beyond the local `logging_middleware` package
- No `console.log` anywhere — all logging goes through `Log()`
- Knapsack algorithm is hand-rolled, no optimisation libraries used
- Incremental commits — one per problem/stage
