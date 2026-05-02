const http = require("http");
const { Log, configure } = require("logging_middleware");
const config = require("./config");
const { handleSchedule } = require("./handler");

configure({ token: config.AUTH_TOKEN });

function router(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const path = url.pathname;

  Log("backend", "info", "route", `${req.method} ${path}`).catch(() => {});

  if (path === "/health" && req.method === "GET") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok" }));
    return;
  }

  if (path === "/schedule" && (req.method === "GET" || req.method === "POST")) {
    handleSchedule(req, res);
    return;
  }

  Log("backend", "warn", "route", `no route for ${req.method} ${path}`).catch(() => {});
  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "not found" }));
}

const server = http.createServer(router);
server.listen(config.SERVER_PORT, () => {
  Log("backend", "info", "route", `scheduler running on port ${config.SERVER_PORT}`).catch(() => {});
});
