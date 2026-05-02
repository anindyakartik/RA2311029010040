const http = require("http");
const { Log } = require("logging_middleware");

function get(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const opts = {
      hostname: parsed.hostname,
      port: parsed.port || 80,
      path: parsed.pathname + parsed.search,
      method: "GET",
      headers,
    };

    Log("backend", "debug", "utils", `GET ${parsed.pathname}`).catch(() => {});

    const req = http.request(opts, (res) => {
      let data = "";
      res.on("data", (chunk) => { data += chunk; });
      res.on("end", () => resolve({ statusCode: res.statusCode, body: data }));
    });

    req.on("error", (err) => {
      Log("backend", "error", "utils", `GET ${parsed.pathname} failed: ${err.message}`).catch(() => {});
      reject(err);
    });

    req.end();
  });
}

module.exports = { get };
