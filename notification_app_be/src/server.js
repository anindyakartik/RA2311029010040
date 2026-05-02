const http = require("http");
const { Log, configure } = require("logging_middleware");
const config = require("./config");
const httpClient = require("./httpClient");
const { topNPriority } = require("./priorityHeap");

configure({ token: config.AUTH_TOKEN });

async function router(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const path = url.pathname;

  Log("backend", "info", "route", `${req.method} ${path}`).catch(() => {});

  if (path === "/health") {
    respond(res, 200, { status: "ok" });
    return;
  }

  if (path === "/priority-inbox" && req.method === "GET") {
    await handlePriorityInbox(req, res, url);
    return;
  }

  Log("backend", "warn", "route", `no route: ${req.method} ${path}`).catch(() => {});
  respond(res, 404, { error: "not found" });
}

async function handlePriorityInbox(req, res, url) {
  const start = Date.now();
  const n = parseInt(url.searchParams.get("n"), 10) || config.DEFAULT_TOP_N;

  Log("backend", "info", "handler", `priority inbox requested, top ${n}`).catch(() => {});

  try {
    const apiRes = await httpClient.get(config.NOTIFICATIONS_URL, {
      Authorization: config.AUTH_TOKEN,
    });

    if (apiRes.statusCode !== 200) {
      const msg = `notifications API returned ${apiRes.statusCode}`;
      Log("backend", "error", "handler", msg).catch(() => {});
      respond(res, 502, { error: msg });
      return;
    }

    const parsed = JSON.parse(apiRes.body);
    const notifications = parsed.notifications || parsed.data || parsed;

    Log("backend", "info", "handler", `fetched ${notifications.length} notifications`).catch(() => {});

    const top = topNPriority(notifications, n, config.TYPE_WEIGHTS);
    const elapsed = Date.now() - start;

    Log("backend", "info", "handler", `returning ${top.length} items in ${elapsed}ms`).catch(() => {});

    respond(res, 200, {
      topN: n,
      count: top.length,
      totalFetched: notifications.length,
      computationTimeMs: elapsed,
      notifications: top,
    });
  } catch (err) {
    Log("backend", "error", "handler", `error: ${err.message}`).catch(() => {});
    respond(res, 500, { error: "internal error", detail: err.message });
  }
}

function respond(res, code, obj) {
  const body = JSON.stringify(obj, null, 2);
  res.writeHead(code, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
}

const server = http.createServer(router);
server.listen(config.SERVER_PORT, () => {
  Log("backend", "info", "route", `notification service on port ${config.SERVER_PORT}`).catch(() => {});
});
