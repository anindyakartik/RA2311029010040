const http = require("http");

const VALID_STACKS = new Set(["backend", "frontend"]);
const VALID_LEVELS = new Set(["debug", "info", "warn", "error", "fatal"]);

// backend gets the full list, frontend is limited to shared packages only
const BACKEND_PACKAGES = new Set([
  "cache", "controller", "cron_job", "db", "domain",
  "handler", "repository", "route", "service",
  "auth", "config", "middleware", "utils"
]);
const FRONTEND_PACKAGES = new Set(["auth", "config", "middleware", "utils"]);

const LOGS_ENDPOINT = "http://20.207.122.201/evaluation-service/logs";
let bearerToken = "";

function configure(opts) {
  if (!opts || !opts.token) throw new Error("logging_middleware: provide { token }");
  bearerToken = opts.token;
}

function validate(stack, level, pkg, message) {
  if (!VALID_STACKS.has(stack)) throw new Error(`invalid stack: ${stack}`);
  if (!VALID_LEVELS.has(level)) throw new Error(`invalid level: ${level}`);

  const allowed = stack === "backend" ? BACKEND_PACKAGES : FRONTEND_PACKAGES;
  if (!allowed.has(pkg)) throw new Error(`invalid package "${pkg}" for stack "${stack}"`);
  if (!message || message.trim().length === 0) throw new Error("message cannot be empty");
}

function Log(stack, level, pkg, message) {
  validate(stack, level, pkg, message);
  if (!bearerToken) throw new Error("call configure({ token }) before Log()");

  const body = JSON.stringify({ stack, level, package: pkg, message });
  const parsed = new URL(LOGS_ENDPOINT);

  const options = {
    hostname: parsed.hostname,
    port: parsed.port || 80,
    path: parsed.pathname,
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(body),
      Authorization: bearerToken,
    },
  };

  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let raw = "";
      res.on("data", (chunk) => { raw += chunk; });
      res.on("end", () => {
        if (res.statusCode >= 200 && res.statusCode < 300) resolve();
        else reject(new Error(`log server: ${res.statusCode} – ${raw}`));
      });
    });
    req.on("error", (err) => reject(new Error(`log request failed: ${err.message}`)));
    req.write(body);
    req.end();
  });
}

module.exports = { Log, configure };
