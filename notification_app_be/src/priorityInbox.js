/**
 * priorityInbox.js
 *
 * Standalone script that:
 *   1. Fetches notifications from the evaluation server
 *   2. Runs them through the priority heap
 *   3. Prints the top N to stdout
 *
 * Run with: node src/priorityInbox.js [n]
 *   n defaults to 10
 */

const { Log, configure } = require("logging_middleware");
const config = require("./config");
const httpClient = require("./httpClient");
const { topNPriority } = require("./priorityHeap");

// ── bootstrap ──────────────────────────────────────────────────
configure({ token: config.AUTH_TOKEN });

const topN = parseInt(process.argv[2], 10) || config.DEFAULT_TOP_N;

(async function main() {
  Log(
    "backend",
    "info",
    "controller",
    `priorityInbox – starting, will select top ${topN} notifications`
  ).catch(() => {});

  // ── fetch notifications ────────────────────────────────────
  let notifications = [];
  try {
    const res = await httpClient.get(config.NOTIFICATIONS_URL, {
      Authorization: config.AUTH_TOKEN,
    });

    if (res.statusCode !== 200) {
      Log(
        "backend",
        "error",
        "controller",
        `priorityInbox – API returned status ${res.statusCode}`
      ).catch(() => {});
      process.exit(1);
    }

    const parsed = JSON.parse(res.body);
    notifications = parsed.notifications || parsed.data || parsed;

    Log(
      "backend",
      "info",
      "controller",
      `priorityInbox – fetched ${notifications.length} notifications from server`
    ).catch(() => {});
  } catch (err) {
    Log(
      "backend",
      "fatal",
      "controller",
      `priorityInbox – failed to fetch notifications: ${err.message}`
    ).catch(() => {});
    process.exit(1);
  }

  // ── run the priority selection ─────────────────────────────
  const topItems = topNPriority(notifications, topN, config.TYPE_WEIGHTS);

  // ── display results ────────────────────────────────────────
  const divider = "─".repeat(70);

  process.stdout.write("\n");
  process.stdout.write(divider + "\n");
  process.stdout.write(`  PRIORITY INBOX  –  Top ${topN} Notifications\n`);
  process.stdout.write(divider + "\n\n");

  topItems.forEach((n, idx) => {
    const rank = String(idx + 1).padStart(2, " ");
    const type = (n.Type || n.type || "unknown").padEnd(10);
    const ts = n.Timestamp || n.timestamp || "n/a";
    const msg = n.Message || n.message || "(no message)";
    const id = n.ID || n.id || "?";

    process.stdout.write(`  ${rank}. [${type}]  ${ts}\n`);
    process.stdout.write(`      ID  : ${id}\n`);
    process.stdout.write(`      Msg : ${msg}\n\n`);
  });

  process.stdout.write(divider + "\n");
  process.stdout.write(
    `  Total fetched: ${notifications.length}  |  Displayed: ${topItems.length}\n`
  );
  process.stdout.write(divider + "\n\n");

  Log(
    "backend",
    "info",
    "controller",
    `priorityInbox – finished, displayed ${topItems.length} notifications`
  ).catch(() => {});
})();
