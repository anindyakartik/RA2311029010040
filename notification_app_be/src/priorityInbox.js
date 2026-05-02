const { Log, configure } = require("logging_middleware");
const config = require("./config");
const httpClient = require("./httpClient");
const { topNPriority } = require("./priorityHeap");

configure({ token: config.AUTH_TOKEN });

const topN = parseInt(process.argv[2], 10) || config.DEFAULT_TOP_N;

(async function main() {
  Log("backend", "info", "controller", `priority inbox starting, top ${topN}`).catch(() => {});

  let notifications = [];

  try {
    const res = await httpClient.get(config.NOTIFICATIONS_URL, {
      Authorization: config.AUTH_TOKEN,
    });

    if (res.statusCode !== 200) {
      Log("backend", "error", "controller", `API returned ${res.statusCode}`).catch(() => {});
      process.exit(1);
    }

    const parsed = JSON.parse(res.body);
    notifications = parsed.notifications || parsed.data || parsed;

    Log("backend", "info", "controller", `fetched ${notifications.length} notifications`).catch(() => {});
  } catch (err) {
    Log("backend", "fatal", "controller", `failed to fetch: ${err.message}`).catch(() => {});
    process.exit(1);
  }

  const top = topNPriority(notifications, topN, config.TYPE_WEIGHTS);
  const line = "─".repeat(68);

  process.stdout.write(`\n${line}\n  PRIORITY INBOX — Top ${topN}\n${line}\n\n`);

  top.forEach((n, i) => {
    const rank = String(i + 1).padStart(2);
    const type = (n.Type || "unknown").padEnd(10);
    const ts = n.Timestamp || "n/a";
    const msg = n.Message || "(no message)";
    process.stdout.write(`  ${rank}. [${type}]  ${ts}\n`);
    process.stdout.write(`      ID : ${n.ID || "?"}\n`);
    process.stdout.write(`      Msg: ${msg}\n\n`);
  });

  process.stdout.write(`${line}\n  Fetched: ${notifications.length}  |  Shown: ${top.length}\n${line}\n\n`);

  Log("backend", "info", "controller", `done, displayed ${top.length} notifications`).catch(() => {});
})();
