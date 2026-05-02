/**
 * httpClient.js
 *
 * Tiny wrapper around Node's built-in http module so the rest of the
 * codebase never has to deal with streams and callbacks directly.
 * Returns a promise that resolves to { statusCode, body }.
 */

const http = require("http");
const { Log } = require("logging_middleware");

/**
 * Perform an HTTP GET request.
 *
 * @param {string} url  – full URL including protocol
 * @param {Object} headers – any extra headers (Authorization etc.)
 * @returns {Promise<{statusCode: number, body: string}>}
 */
function get(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const opts = {
      hostname: parsed.hostname,
      port: parsed.port || 80,
      path: parsed.pathname + parsed.search,
      method: "GET",
      headers: headers,
    };

    Log(
      "backend",
      "debug",
      "utils",
      `httpClient – GET ${parsed.pathname}`
    ).catch(() => {});

    const req = http.request(opts, (res) => {
      let data = "";
      res.on("data", (chunk) => {
        data += chunk;
      });
      res.on("end", () => {
        resolve({ statusCode: res.statusCode, body: data });
      });
    });

    req.on("error", (err) => {
      Log(
        "backend",
        "error",
        "utils",
        `httpClient – GET ${parsed.pathname} failed: ${err.message}`
      ).catch(() => {});
      reject(err);
    });

    req.end();
  });
}

module.exports = { get };
