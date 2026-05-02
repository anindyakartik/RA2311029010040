# Campus Notification Platform — System Design Document

Author: Anindya  
Date: 2 May 2026  

This document walks through the full design of a campus notification backend
that delivers real-time updates about **Placements**, **Events**, and **Results**
to students. Each stage builds on the one before it.

---

## Stage 1 — API Design

### 1.1 Guiding Principles

- Every route sits under `/api/v1` so we can version without breaking clients.
- Standard HTTP verbs: GET for reads, POST for writes, PATCH for partials.
- Authorization header carries a Bearer token on every request.
- Responses always return `{ data, meta }` on success or `{ error, code }` on failure.

### 1.2 Endpoints

#### Notifications

| Method | Path                                | Purpose                              |
|--------|-------------------------------------|--------------------------------------|
| GET    | `/api/v1/notifications`             | List notifications for current user  |
| GET    | `/api/v1/notifications/:id`         | Get a single notification            |
| POST   | `/api/v1/notifications`             | Create a new notification (admin)    |
| PATCH  | `/api/v1/notifications/:id/read`    | Mark one notification as read        |
| PATCH  | `/api/v1/notifications/read-all`    | Mark all notifications as read       |
| DELETE | `/api/v1/notifications/:id`         | Delete a notification (admin)        |
| GET    | `/api/v1/notifications/unread-count`| Count of unread notifications        |

#### Query Parameters (GET list)

| Param          | Type    | Default  | Notes                                  |
|----------------|---------|----------|----------------------------------------|
| `page`         | int     | 1        | Pagination page number                 |
| `limit`        | int     | 20       | Items per page (max 100)               |
| `type`         | string  | —        | Filter: `Placement`, `Event`, `Result` |
| `isRead`       | boolean | —        | Filter by read status                  |
| `sortBy`       | string  | createdAt| Sorting field                          |
| `order`        | string  | desc     | `asc` or `desc`                        |

#### Headers (all routes)

```
Authorization: Bearer <token>
Content-Type: application/json
```

### 1.3 Request / Response Schemas

**POST /api/v1/notifications** (create)

Request:
```json
{
  "type": "Placement",
  "title": "Google SDE Internship Drive",
  "message": "Google is visiting campus on 10 May. Register by 5 May.",
  "targetStudentIDs": ["stu-1042", "stu-2001"],
  "priority": "high"
}
```

Response (201):
```json
{
  "data": {
    "id": "ntf-8a3b",
    "type": "Placement",
    "title": "Google SDE Internship Drive",
    "message": "Google is visiting campus on 10 May. Register by 5 May.",
    "priority": "high",
    "createdAt": "2026-05-02T10:00:00Z"
  },
  "meta": {
    "recipientCount": 2
  }
}
```

**GET /api/v1/notifications?type=Placement&isRead=false&limit=5**

Response (200):
```json
{
  "data": [
    {
      "id": "ntf-8a3b",
      "type": "Placement",
      "title": "Google SDE Internship Drive",
      "message": "Google is visiting campus on 10 May...",
      "isRead": false,
      "priority": "high",
      "createdAt": "2026-05-02T10:00:00Z"
    }
  ],
  "meta": {
    "page": 1,
    "limit": 5,
    "totalItems": 1,
    "totalPages": 1
  }
}
```

**PATCH /api/v1/notifications/:id/read**

Response (200):
```json
{
  "data": {
    "id": "ntf-8a3b",
    "isRead": true,
    "readAt": "2026-05-02T10:30:00Z"
  }
}
```

### 1.4 Real-Time Delivery — Server-Sent Events (SSE)

I'm going with **SSE** over WebSockets for this particular use case. The reasoning:

1. **Unidirectional** — notifications flow server → client only. There is no need
   for the client to push data back through the same channel, which is the main
   selling point of WebSockets.
2. **Simpler infrastructure** — SSE runs over plain HTTP/1.1, so it plays nicely
   with load balancers and reverse proxies without special upgrade handling.
3. **Automatic reconnection** — the `EventSource` API in browsers reconnects
   on its own; with WebSockets you have to wire that up yourself.
4. **Lower overhead** — no per-frame masking, no ping/pong frames. For a
   notification stream that sends a few events per minute, this matters.

**SSE endpoint:**

```
GET /api/v1/notifications/stream
```

Headers:
```
Authorization: Bearer <token>
Accept: text/event-stream
```

Event format:
```
event: notification
data: {"id":"ntf-8a3b","type":"Placement","title":"Google SDE Internship Drive","message":"...","createdAt":"2026-05-02T10:00:00Z"}

event: heartbeat
data: {"ts":"2026-05-02T10:01:00Z"}
```

The `heartbeat` event keeps the connection alive across proxies that have
idle-timeout policies.

---

## Stage 2 — Persistent Storage Design

### 2.1 Database Choice — PostgreSQL

I'm picking **PostgreSQL** for these reasons:

- **Strong consistency** — notification read-status updates need ACID guarantees.
  If a student marks something as read, the next GET must reflect that. With an
  eventually-consistent NoSQL store you could end up showing the same "unread"
  badge after the user already clicked through it.
- **Rich querying** — we need filters on type, read status, student, date ranges,
  and ordering. SQL handles this natively. In MongoDB you'd need compound indexes
  that are harder to reason about.
- **Enum support** — `notificationType` maps cleanly to a Postgres ENUM.
- **JSONB escape hatch** — if we later need to store arbitrary metadata per
  notification, we can add a JSONB column without a migration.

### 2.2 Schema

```sql
-- ENUM for notification categories
CREATE TYPE notification_type AS ENUM ('Placement', 'Result', 'Event');

-- ENUM for priority levels
CREATE TYPE priority_level AS ENUM ('low', 'normal', 'high', 'critical');

-- Students table
CREATE TABLE students (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name          VARCHAR(120) NOT NULL,
    email         VARCHAR(255) NOT NULL UNIQUE,
    department    VARCHAR(80),
    batch_year    SMALLINT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Notifications table (one row per student per notification)
CREATE TABLE notifications (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id        UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    notification_type notification_type NOT NULL,
    title             VARCHAR(300) NOT NULL,
    message           TEXT NOT NULL,
    priority          priority_level NOT NULL DEFAULT 'normal',
    is_read           BOOLEAN NOT NULL DEFAULT FALSE,
    read_at           TIMESTAMPTZ,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes (see rationale in Stage 3)
CREATE INDEX idx_notif_student_read_created
    ON notifications (student_id, is_read, created_at DESC);

CREATE INDEX idx_notif_type_created
    ON notifications (notification_type, created_at DESC);

CREATE INDEX idx_notif_student_type
    ON notifications (student_id, notification_type);
```

### 2.3 Scaling Concerns

As data grows past a few million rows:

| Problem | Why It Hurts | Solution |
|---------|-------------|----------|
| **Table scan on large notifications table** | Every filter query touches rows across all students. Even with indexes, the B-tree gets deep and cold pages multiply. | **Partition by `created_at`** using Postgres range partitioning (monthly buckets). Queries that include a date filter automatically prune irrelevant partitions. |
| **Hot student rows** | A student who subscribes to everything generates a disproportionate number of rows. Sequential scans on `student_id` slow down. | The composite index on `(student_id, is_read, created_at DESC)` keeps these lookups as index-only scans. Beyond that, **archiving** old read notifications to a cold table reduces live table size. |
| **Write amplification during bulk sends** | A single admin action ("Notify All") inserts 50 000 rows at once, causing WAL pressure and index bloat. | Use `COPY` or batched multi-row `INSERT` instead of one-at-a-time inserts. Queue the writes through a message broker (covered in Stage 5). |
| **Connection exhaustion** | Every SSE connection holds a DB poll or LISTEN. At 50k students that's 50k connections. | Use **Postgres LISTEN/NOTIFY** with a single connection that fans out in-process, or use Redis Pub/Sub as the fan-out layer in front of the DB. |

### 2.4 Queries for Each API Endpoint

**GET /api/v1/notifications (list with filters)**
```sql
SELECT id, notification_type, title, message, priority, is_read, created_at
FROM notifications
WHERE student_id = $1
  AND ($2::notification_type IS NULL OR notification_type = $2)
  AND ($3::boolean IS NULL OR is_read = $3)
ORDER BY created_at DESC
LIMIT $4 OFFSET $5;
```

**GET /api/v1/notifications/:id (single)**
```sql
SELECT id, notification_type, title, message, priority, is_read, read_at, created_at
FROM notifications
WHERE id = $1 AND student_id = $2;
```

**POST /api/v1/notifications (create — bulk insert for multiple students)**
```sql
INSERT INTO notifications (student_id, notification_type, title, message, priority)
SELECT unnest($1::uuid[]), $2, $3, $4, $5
RETURNING id, created_at;
```

**PATCH /api/v1/notifications/:id/read**
```sql
UPDATE notifications
SET is_read = TRUE, read_at = NOW(), updated_at = NOW()
WHERE id = $1 AND student_id = $2
RETURNING id, is_read, read_at;
```

**PATCH /api/v1/notifications/read-all**
```sql
UPDATE notifications
SET is_read = TRUE, read_at = NOW(), updated_at = NOW()
WHERE student_id = $1 AND is_read = FALSE;
```

**DELETE /api/v1/notifications/:id**
```sql
DELETE FROM notifications
WHERE id = $1 AND student_id = $2;
```

**GET /api/v1/notifications/unread-count**
```sql
SELECT COUNT(*) AS unread
FROM notifications
WHERE student_id = $1 AND is_read = FALSE;
```

---

## Stage 3 — Query Analysis and Optimisation

The query under review:

```sql
SELECT * FROM notifications
WHERE studentID = 1042 AND isRead = false
ORDER BY createdAt DESC;
```

### 3.1 Is it logically correct?

**Almost.** The intent is sound — grab every unread notification for a specific
student, newest first — but there are two issues worth noting:

- **Column naming:** if the actual schema uses `student_id` and `is_read` (as
  defined in Stage 2), then `studentID` and `isRead` are wrong and the query
  won't even execute. Assuming camelCase columns exist in the legacy schema,
  the logic itself is fine.
- **`SELECT *`** pulls every column including large `message` TEXT fields. If the
  caller only needs a listing view, selecting explicit columns is cheaper
  because the DB can rely on smaller index-only scans.

So the query is correct in filtering logic but suboptimal in projection.

### 3.2 Why is it slow at scale?

With 5 million notification rows and 50 000 students:

1. **No covering index** — without a composite index on `(studentID, isRead,
   createdAt)`, the database has to do a sequential scan or use a single-column
   index on `studentID` (which still hits tens of thousands of rows), then
   filter `isRead`, then sort `createdAt`. Each step multiplies I/O.

2. **The sort** — `ORDER BY createdAt DESC` requires either an index that
   already stores rows in that order or an in-memory (or on-disk) sort pass.
   For a student with thousands of notifications, this sort alone can be
   expensive.

3. **No pagination** — the query returns *all* matching rows. If a student has
   3 000 unread notifications, all 3 000 are fetched and transferred. In
   practice you want `LIMIT` and `OFFSET` (or cursor-based pagination).

4. **`SELECT *`** — as mentioned, this forces the DB to read full tuples from
   the heap even when the index could answer the query on its own.

### 3.3 Recommended Improvements

**Step 1 — Add a composite index:**

```sql
CREATE INDEX idx_student_unread_recent
    ON notifications (studentID, isRead, createdAt DESC);
```

This single index turns the query into an index scan with zero sorting.
The DB walks the B-tree to the leaf matching `(1042, false)`, then reads
entries in already-sorted order.

**Step 2 — Paginate:**

```sql
SELECT id, notification_type, title, created_at
FROM notifications
WHERE studentID = 1042 AND isRead = false
ORDER BY createdAt DESC
LIMIT 20 OFFSET 0;
```

**Step 3 — Select only needed columns** so the query becomes an index-only
scan if the index covers the projected columns.

**Cost improvement:**

| Before | After |
|--------|-------|
| Full table scan or partial index scan: **O(n)** where n = total rows | Composite index seek: **O(log n) + O(k)** where k = result set size |
| In-memory sort: **O(k log k)** | No sort needed (index is pre-ordered) |
| Total: **O(n + k log k)** | Total: **O(log n + k)** |

For n = 5 000 000 and k = 20 (one page), this is the difference between
scanning millions of rows versus touching maybe 4 B-tree levels and 20
leaf nodes.

### 3.4 Should you index every column?

**No.** A teammate suggesting "add indexes on every column" means well but
it's a bad idea for several reasons:

1. **Write cost** — every INSERT, UPDATE, and DELETE has to maintain every
   index. With 10 indexes on a table, a single insert does 10 B-tree
   modifications. During bulk sends (50 000 inserts), this multiplies write
   latency and WAL volume by an order of magnitude.

2. **Storage overhead** — each index is roughly the size of the indexed
   columns × row count. Indexing every column roughly doubles the table's
   on-disk footprint.

3. **Planner confusion** — the query planner has to evaluate all possible
   indexes. More indexes means more planning time. In some edge cases the
   planner picks a suboptimal index because statistics are stale.

4. **Most queries only filter on 2–3 columns** — a well-chosen composite
   index on those columns is far more efficient than five single-column
   indexes that the DB has to bitmap-merge at query time.

The right approach is to look at your actual query patterns and build
composite indexes that match them. One great composite index beats five
mediocre single-column ones.

### 3.5 Placement Notifications in the Last 7 Days

```sql
SELECT DISTINCT s.id, s.name, s.email, s.department, s.batch_year
FROM students s
INNER JOIN notifications n ON n.student_id = s.id
WHERE n.notification_type = 'Placement'
  AND n.created_at >= NOW() - INTERVAL '7 days'
ORDER BY s.name;
```

This query is efficient because:
- It hits the `idx_notif_type_created` index on `(notification_type, created_at DESC)`,
  which narrows the scan to only recent Placement rows.
- The join to `students` uses the primary key index.
- `DISTINCT` deduplicates students who received multiple Placement notifications.

---

## Stage 4 — Caching and Performance

### 4.1 The Problem

Every time a student opens their notification page, we hit:

```sql
SELECT ... FROM notifications WHERE student_id = $1 AND is_read = false
ORDER BY created_at DESC LIMIT 20;
```

With 50 000 students loading pages throughout the day, that's potentially
hundreds of thousands of identical queries per hour. Most of the time the
result hasn't changed between page loads.

### 4.2 Strategy Comparison

#### Option A — Application-Level Cache (Redis)

**How it works:** After the first DB query for a student, store the result
in Redis with a key like `notif:unread:{studentID}`. Subsequent requests
read from Redis. Invalidate the key whenever a new notification is created
for that student or when they mark something as read.

| Dimension       | Assessment |
|-----------------|-----------|
| **Latency**     | Sub-millisecond reads from Redis vs 5–20ms from Postgres |
| **Consistency** | Near-real-time. Invalidation happens on write, so staleness window is the brief gap between the DB write and the cache eviction (typically < 50ms) |
| **Complexity**  | Moderate. Need to wire invalidation into every write path. Cache stampede protection (locking or probabilistic early expiration) is needed under high concurrency |
| **Cost**        | Redis cluster is an extra service to run, but memory needs are modest (each student's cached page is ~2 KB, so 50k students = ~100 MB) |

**Invalidation approach:** Event-driven. On every INSERT into `notifications`
or UPDATE of `is_read`, publish an event (e.g. via Redis Pub/Sub or Postgres
NOTIFY). The application layer listens and evicts the affected keys. This is
known as **write-through invalidation**.

#### Option B — Database Query Cache (Materialized View)

**How it works:** Create a materialized view that pre-computes the unread
count and recent notifications per student. Refresh it on a schedule
(e.g. every 30 seconds).

| Dimension       | Assessment |
|-----------------|-----------|
| **Latency**     | Slightly faster than raw queries because the view is pre-computed, but still a DB round-trip |
| **Consistency** | Stale by up to 30 seconds (or whatever the refresh interval is). During placement season when notifications fly in every few seconds, this is noticeable |
| **Complexity**  | Low setup, but `REFRESH MATERIALIZED VIEW CONCURRENTLY` takes a table-level lock that competes with writes |
| **Cost**        | No extra service, but the materialized view consumes disk and the refresh is a full re-query |

#### Option C — HTTP Cache (CDN / ETag)

**How it works:** Set `Cache-Control` and `ETag` headers on notification
responses. The client sends `If-None-Match` and gets 304 Not Modified when
nothing has changed.

| Dimension       | Assessment |
|-----------------|-----------|
| **Latency**     | Saves bandwidth and client rendering time, but the server still has to compute the ETag (which means running the query) |
| **Consistency** | Good — every request is validated. But it doesn't reduce DB load, which is the actual bottleneck |
| **Complexity**  | Low |
| **Cost**        | Negligible |

### 4.3 Recommended Approach

**Use Option A (Redis) as the primary cache, with Option C (ETag) as a
complementary layer.**

The critical bottleneck is DB query volume, which only a server-side cache
solves. Redis handles that. ETags on top save bandwidth for mobile clients.

Cache structure in Redis:

```
Key:   notif:unread:{studentID}
Value: JSON string of the 20 most recent unread notifications
TTL:   300 seconds (safety net; primary invalidation is event-driven)
```

Write-through flow:

1. Admin creates notification → INSERT into Postgres
2. After commit, publish `invalidate:{studentID}` for each recipient
3. Cache listener receives event → DEL the affected Redis keys
4. Next page load hits Redis, misses, queries DB, populates cache

This keeps the staleness window under 100ms in practice while offloading
the vast majority of reads from Postgres.

---

## Stage 5 — Bulk Notification Reliability

### 5.1 Shortcomings of the Proposed Implementation

The given pseudocode:

```python
function notify_all(student_ids, message):
  for student_id in student_ids:
    send_email(student_id, message)
    save_to_db(student_id, message)
    push_to_app(student_id, message)
```

Problems:

1. **Sequential execution** — Processing 50 000 students one by one takes
   forever. If each iteration costs 200ms (email API + DB write + push), the
   total wall time is ~2.8 hours.

2. **No fault tolerance** — If `send_email` fails for student #25 001, the
   remaining 24 999 students never get processed. There is no retry, no
   dead-letter tracking, no way to resume from where it failed.

3. **Tight coupling** — The email send, DB write, and push notification are
   done synchronously in the same loop iteration. If the email API is slow or
   down, it blocks the DB write and the push.

4. **No idempotency** — If the process crashes after emailing student #25 000
   but before saving to DB, restarting the entire loop will re-send emails to
   the first 25 000 students.

5. **No backpressure** — External APIs (email, push) have rate limits. Firing
   50 000 requests in a tight loop will trigger throttling or bans.

6. **DB connection starvation** — 50 000 individual INSERT statements, each
   opening and closing a transaction, will saturate the connection pool and
   spike WAL writes.

### 5.2 Handling the 200 Failed Emails

The logs show that `send_email` failed for 200 students mid-run. Steps:

1. **Identify affected students** — query the logs (or a tracking table) to
   find which 200 student IDs had email failures. If the system wrote to the
   DB before emailing, we can query for notifications that were inserted but
   have `email_sent = false`.

2. **Retry with exponential backoff** — push the 200 failed student IDs into
   a retry queue with backoff (e.g. 1s, 2s, 4s, up to 60s). Most email
   failures are transient (rate limits, timeouts).

3. **Dead-letter queue** — after 3–5 retries, move permanently failing IDs
   to a dead-letter queue for manual review. Alert the admin.

4. **Verify DB consistency** — ensure the DB row exists for each of the 200
   students (the notification was saved even if the email wasn't sent). The
   student should still see the notification in their inbox; they just didn't
   get the email.

### 5.3 Redesigned Architecture

```
HR clicks "Notify All"
        │
        ▼
  ┌─────────────┐
  │ API Handler  │  ← responds 202 Accepted immediately
  └──────┬──────┘
         │ enqueue one "bulk job" message
         ▼
  ┌─────────────┐
  │ Message Queue│  (Redis Streams / RabbitMQ / SQS)
  └──────┬──────┘
         │
         ▼
  ┌──────────────────┐
  │ Worker (consumer) │  ← multiple workers can run in parallel
  └──────┬───────────┘
         │
         │  1. Chunk student_ids into batches of 500
         │  2. For each batch:
         │     a. Batch INSERT into notifications table
         │     b. Fan out individual messages to email queue
         │     c. Fan out individual messages to push queue
         │
         ▼
  ┌──────────────┐     ┌──────────────┐
  │ Email Worker  │     │ Push Worker   │
  │ (with retry)  │     │ (with retry)  │
  └──────────────┘     └──────────────┘
```

Revised pseudocode:

```python
# ── API layer ─────────────────────────────────────────────
function handle_notify_all(request):
    job_id = generate_uuid()
    enqueue("bulk_notification_jobs", {
        "job_id": job_id,
        "student_ids": request.student_ids,
        "message": request.message,
        "type": request.type
    })
    return { "status": "accepted", "job_id": job_id }  # 202


# ── Bulk worker ──────────────────────────────────────────
function process_bulk_job(job):
    batches = chunk(job.student_ids, size=500)

    for batch in batches:
        # batch DB insert — one query for 500 rows
        notification_ids = batch_insert_notifications(batch, job.message, job.type)

        # fan out to email and push queues
        for student_id, notif_id in zip(batch, notification_ids):
            enqueue("email_tasks", {
                "student_id": student_id,
                "notif_id": notif_id,
                "message": job.message,
                "attempt": 0
            })
            enqueue("push_tasks", {
                "student_id": student_id,
                "notif_id": notif_id,
                "message": job.message
            })

    mark_job_complete(job.job_id)


# ── Email worker (with retry + dead-letter) ──────────────
function process_email_task(task):
    try:
        send_email(task.student_id, task.message)
        update_notification(task.notif_id, email_sent=True)
    except TransientError:
        if task.attempt < MAX_RETRIES:
            delay = exponential_backoff(task.attempt)
            enqueue_delayed("email_tasks", task, delay,
                            attempt=task.attempt + 1)
        else:
            enqueue("email_dead_letter", task)
            alert_admin(task)


# ── Push worker ──────────────────────────────────────────
function process_push_task(task):
    try:
        push_to_app(task.student_id, task.message)
    except:
        enqueue("push_dead_letter", task)
```

### 5.4 Should DB Write and Email Send Share a Transaction?

**No, they should not.** Here's why:

1. **Availability over atomicity** — If the email API is down for 10 minutes,
   wrapping both in a DB transaction means the notification row never gets
   committed. The student doesn't see it in their inbox *and* doesn't get the
   email. That's a worse outcome than saving to the DB and retrying the email
   separately.

2. **Transaction duration** — Email API calls take 100–500ms. Holding a DB
   transaction open for that long blocks other writes on the same row and eats
   connection pool slots. Under bulk load (50 000 students), this will
   exhaust the pool within seconds.

3. **External calls inside transactions are an anti-pattern** — transactions
   should only contain DB operations. If the email succeeds but the DB commit
   fails (e.g. network blip), the email can't be un-sent. You've created an
   inconsistency that the transaction was supposed to prevent.

**The correct pattern:** Write to the DB first (establish authoritative state),
then send the email as a separate step. Track email delivery status with a
`email_sent` boolean on the notification row. A background reconciliation
job can pick up any rows where `email_sent = false` and retry them.

---

## Stage 6 — Priority Inbox

### 6.1 Problem Summary

Surface the top `n` most important unread notifications (default n = 10)
from a stream. Priority is determined by:

1. **Type weight:** Placement (3) > Result (2) > Event (1)
2. **Recency:** Within the same type, more recent notifications rank higher.

### 6.2 Approach and Data Structure Choice

I use a **bounded min-heap** of size `n`.

**Why a min-heap and not a simple sort?**

- Sorting the entire list is O(m log m) where m is the total number of
  notifications. For large feeds, this is wasteful because we only care about
  the top 10.
- A bounded min-heap processes the stream in O(m log n) time and O(n) space.
  Since n is small (10), `log n ≈ 3.3`, so each notification is processed in
  near-constant time.
- The min-heap also naturally supports a **streaming** scenario: as new
  notifications arrive, we can offer them to the heap without re-processing
  old ones. The invariant — the heap always holds the current top n — is
  maintained incrementally.

**Composite scoring:**

To avoid a multi-key comparison, I collapse type weight and timestamp into a
single numeric score:

```
score = typeWeight × 10^15 + timestamp_in_milliseconds
```

The `10^15` multiplier ensures a Placement notification (weight 3) always
outranks any Result notification (weight 2) regardless of timestamp, because
the weight term contributes at least `10^15` more than any possible timestamp
difference. Within the same type, the higher timestamp wins.

**Why this works for streams:**

The bounded min-heap keeps the weakest item at the root. When a new
notification arrives:
- If the heap has fewer than n items, the item is inserted directly.
- If the heap is full, we compare the new item's score against the root.
  If the new score is higher, we replace the root and sink it down.
  Otherwise, we discard the new item.

This means we never store more than n items in memory, and each insertion
is O(log n).

### 6.3 Implementation

The working code lives in `notification_app_be/src/`:

- **`priorityHeap.js`** — The min-heap data structure and `topNPriority()` function.
- **`priorityInbox.js`** — Standalone CLI script that fetches from the API and prints results.
- **`server.js`** — HTTP server exposing `GET /priority-inbox?n=10`.

Run the standalone script:

```bash
cd notification_app_be
npm install
node src/priorityInbox.js 10
```

Or hit the HTTP endpoint:

```bash
curl http://localhost:5000/priority-inbox?n=10
```

### 6.4 Complexity Analysis

| Operation | Time | Space |
|-----------|------|-------|
| Process all m notifications through heap | O(m log n) | O(n) |
| Extract sorted top-n from heap | O(n log n) | O(n) |
| Total | O(m log n) | O(n) |

For m = 10 000 and n = 10, this is ~33 000 comparisons versus ~132 000 for
a full O(m log m) sort. The difference grows as m increases.

### 6.5 Output

The program produces output in this format:

```
──────────────────────────────────────────────────────────────────────
  PRIORITY INBOX  –  Top 10 Notifications
──────────────────────────────────────────────────────────────────────

   1. [Placement ]  2026-05-02 09:45:00
      ID  : abc-123
      Msg : Google is recruiting for SDE roles

   2. [Placement ]  2026-05-01 14:30:00
      ID  : def-456
      Msg : Amazon placement drive announced

  ...

──────────────────────────────────────────────────────────────────────
  Total fetched: 150  |  Displayed: 10
──────────────────────────────────────────────────────────────────────
```

(Actual output screenshots are included in the `notification_app_be/` folder after running against the live API.)
