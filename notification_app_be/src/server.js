/**
 * server.js
 *
 * HTTP server for the notification microservice.
 * Exposes the priority inbox as a REST endpoint alongside
 * the standalone CLI script.
 */

const http = require("http");
const { Log, configure } = require("logging_middleware");
const config = require("./config");
const httpClient = require("./httpClient");
const { topNPriority } = require("./priorityHeap");

// ── bootstrap logging ──────────────────────────────────────────
configure({ token: config.AUTH_TOKEN });

// ── route table ────────────────────────────────────────────────

async function router(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const path = url.pathname;

  Log("backend", "info", "route", `incoming ${req.method} ${path}`).catch(
    () => {}
  );

  // health-check
  if (path === "/health") {
    _json(res, 200, { status: "ok" });
    return;
  }

  // GET /priority-inbox?n=10
  if (path === "/priority-inbox" && req.method === "GET") {
    await handlePriorityInbox(req, res, url);
    return;
  }

  Log(
    "backend",
    "warn",
    "route",
    `no handler for ${req.method} ${path}`
  ).catch(() => {});
  _json(res, 404, { error: "not found" });
}

// ── handler ────────────────────────────────────────────────────

async function handlePriorityInbox(req, res, url) {
  const start = Date.now();
  const n = parseInt(url.searchParams.get("n"), 10) || config.DEFAULT_TOP_N;

  Log(
    "backend",
    "info",
    "handler",
    `handlePriorityInbox – requested top ${n} notifications`
  ).catch(() => {});

  try {
    const apiRes = await httpClient.get(config.NOTIFICATIONS_URL, {
      Authorization: config.AUTH_TOKEN,
    });

    if (apiRes.statusCode !== 200) {
      const msg = `notifications API returned ${apiRes.statusCode}`;
      Log("backend", "error", "handler", msg).catch(() => {});
      _json(res, 502, { error: msg });
      return;
    }

    const parsed = JSON.parse(apiRes.body);
    const notifications = parsed.notifications || parsed.data || parsed;

    Log(
      "backend",
      "info",
      "handler",
      `handlePriorityInbox – fetched ${notifications.length} notifications`
    ).catch(() => {});

    const topItems = topNPriority(notifications, n, config.TYPE_WEIGHTS);

    const elapsed = Date.now() - start;

    Log(
      "backend",
      "info",
      "handler",
      `handlePriorityInbox – returning ${topItems.length} items in ${elapsed}ms`
    ).catch(() => {});

    _json(res, 200, {
      topN: n,
      count: topItems.length,
      totalFetched: notifications.length,
      computationTimeMs: elapsed,
      notifications: topItems,
    });
  } catch (err) {
    Log(
      "backend",
      "error",
      "handler",
      `handlePriorityInbox – unhandled error: ${err.message}`
    ).catch(() => {});
    _json(res, 500, { error: "internal error", detail: err.message });
  }
}

// ── helpers ────────────────────────────────────────────────────

function _json(res, code, obj) {
  const body = JSON.stringify(obj, null, 2);
  res.writeHead(code, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
}

// ── start ──────────────────────────────────────────────────────

const server = http.createServer(router);

server.listen(config.SERVER_PORT, () => {
  Log(
    "backend",
    "info",
    "route",
    `notification-app listening on port ${config.SERVER_PORT}`
  ).catch(() => {});
});
