/**
 * server.js
 *
 * Entry point for the vehicle maintenance scheduler microservice.
 * Spins up a plain HTTP server — no frameworks, just Node's stdlib.
 */

const http = require("http");
const { Log, configure } = require("logging_middleware");
const config = require("./config");
const { handleSchedule } = require("./handler");

// ── bootstrap logging middleware ───────────────────────────────
configure({ token: config.AUTH_TOKEN });

// ── route table ────────────────────────────────────────────────

function router(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const path = url.pathname;

  Log(
    "backend",
    "info",
    "route",
    `incoming ${req.method} ${path}`
  ).catch(() => {});

  // health-check
  if (path === "/health" && req.method === "GET") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok" }));
    return;
  }

  // main endpoint
  if (path === "/schedule" && (req.method === "GET" || req.method === "POST")) {
    handleSchedule(req, res);
    return;
  }

  // fallback
  Log(
    "backend",
    "warn",
    "route",
    `no handler for ${req.method} ${path} – returning 404`
  ).catch(() => {});

  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "not found" }));
}

// ── start server ───────────────────────────────────────────────

const server = http.createServer(router);

server.listen(config.SERVER_PORT, () => {
  Log(
    "backend",
    "info",
    "route",
    `vehicle-maintenance-scheduler listening on port ${config.SERVER_PORT}`
  ).catch(() => {});
});
