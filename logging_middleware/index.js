/**
 * Logging Middleware
 *
 * A reusable logging package that ships structured log entries
 * to the remote evaluation server over HTTP. Every call validates
 * the arguments against an allow-list before firing the request,
 * so bad data never leaves the process.
 *
 * Usage:
 *   const { Log, configure } = require('logging_middleware');
 *   configure({ token: 'Bearer ...' });
 *   Log('backend', 'info', 'controller', 'user fetched successfully');
 */

const http = require("http");

// ── allow-lists ────────────────────────────────────────────────

const VALID_STACKS = new Set(["backend", "frontend"]);

const VALID_LEVELS = new Set(["debug", "info", "warn", "error", "fatal"]);

const BACKEND_PACKAGES = new Set([
  "cache",
  "controller",
  "cron_job",
  "db",
  "domain",
  "handler",
  "repository",
  "route",
  "service",
]);

const SHARED_PACKAGES = new Set(["auth", "config", "middleware", "utils"]);

// combine both sets for a quick lookup when stack === "backend"
const ALL_BACKEND_PACKAGES = new Set([...BACKEND_PACKAGES, ...SHARED_PACKAGES]);

// frontend can only use shared packages
const ALL_FRONTEND_PACKAGES = new Set([...SHARED_PACKAGES]);

// ── state ──────────────────────────────────────────────────────

const ENDPOINT_URL = "http://20.207.122.201/evaluation-service/logs";
let _authToken = "";

/**
 * Set the Bearer token that will be attached to every log request.
 * Call this once at startup.
 *
 * @param {{ token: string }} opts
 */
function configure(opts) {
  if (!opts || !opts.token) {
    throw new Error("logging_middleware: configure() needs { token }");
  }
  _authToken = opts.token;
}

/**
 * Validate all four fields and throw a clear error when something is off.
 */
function _validate(stack, level, pkg, message) {
  if (!VALID_STACKS.has(stack)) {
    throw new Error(
      `logging_middleware: invalid stack "${stack}". Expected one of: ${[...VALID_STACKS].join(", ")}`
    );
  }
  if (!VALID_LEVELS.has(level)) {
    throw new Error(
      `logging_middleware: invalid level "${level}". Expected one of: ${[...VALID_LEVELS].join(", ")}`
    );
  }

  const allowed =
    stack === "backend" ? ALL_BACKEND_PACKAGES : ALL_FRONTEND_PACKAGES;
  if (!allowed.has(pkg)) {
    throw new Error(
      `logging_middleware: invalid package "${pkg}" for stack "${stack}". Allowed: ${[...allowed].join(", ")}`
    );
  }

  if (typeof message !== "string" || message.trim().length === 0) {
    throw new Error("logging_middleware: message must be a non-empty string");
  }
}

/**
 * Ship a log entry to the evaluation server.
 *
 * @param {string} stack   – "backend" | "frontend"
 * @param {string} level   – "debug" | "info" | "warn" | "error" | "fatal"
 * @param {string} pkg     – one of the allowed package names
 * @param {string} message – human-readable description of what happened
 * @returns {Promise<void>}
 */
function Log(stack, level, pkg, message) {
  _validate(stack, level, pkg, message);

  if (!_authToken) {
    throw new Error(
      "logging_middleware: call configure({ token }) before using Log()"
    );
  }

  const body = JSON.stringify({
    stack: stack,
    level: level,
    package: pkg,
    message: message,
  });

  const parsed = new URL(ENDPOINT_URL);

  const options = {
    hostname: parsed.hostname,
    port: parsed.port || 80,
    path: parsed.pathname,
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(body),
      Authorization: _authToken,
    },
  };

  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let chunks = "";
      res.on("data", (d) => {
        chunks += d;
      });
      res.on("end", () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve();
        } else {
          reject(
            new Error(
              `logging_middleware: server responded ${res.statusCode} – ${chunks}`
            )
          );
        }
      });
    });
    req.on("error", (err) => {
      reject(
        new Error(`logging_middleware: request failed – ${err.message}`)
      );
    });
    req.write(body);
    req.end();
  });
}

module.exports = { Log, configure };
