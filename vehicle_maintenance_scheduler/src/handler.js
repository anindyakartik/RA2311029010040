const dataService = require("./dataService");
const scheduler = require("./scheduler");
const { Log } = require("logging_middleware");

async function handleSchedule(req, res) {
  const startTime = Date.now();

  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    let depotID = (url.searchParams.get("depotID") || "").trim();

    if (!depotID && req.method === "POST") {
      const bodyStr = await readBody(req);
      try {
        const parsed = JSON.parse(bodyStr);
        depotID = String(parsed.depotID || parsed.depotId || parsed.depot_id || "").trim();
      } catch (_) {}
    }

    if (!depotID) {
      Log("backend", "warn", "handler", "missing depotID in request").catch(() => {});
      respond(res, 400, { error: "depotID is required" });
      return;
    }

    Log("backend", "info", "handler", `schedule request for depot ${depotID}`).catch(() => {});

    const [depots, vehicles] = await Promise.all([
      dataService.fetchDepots(),
      dataService.fetchVehicles(),
    ]);

    const numericID = Number(depotID);
    const depot = depots.find((d) => {
      const id = d.ID || d.id || d.depotID || d.depotId;
      return id === numericID || id === depotID || String(id) === depotID;
    });

    if (!depot) {
      Log("backend", "warn", "handler", `depot ${depotID} not found`).catch(() => {});
      respond(res, 404, { error: `depot ${depotID} not found` });
      return;
    }

    const capacity =
      parseFloat(depot.MechanicHours) || parseFloat(depot.Capacity) ||
      parseFloat(depot.Budget) || 0;

    Log("backend", "info", "handler", `depot ${depotID} budget: ${capacity}h`).catch(() => {});

    const result = scheduler.selectVehicles(vehicles, capacity);
    const elapsed = Date.now() - startTime;

    Log("backend", "info", "handler", `returning ${result.selectedVehicles.length} vehicles in ${elapsed}ms`).catch(() => {});

    respond(res, 200, {
      depotID,
      capacity,
      selected: result.selectedVehicles,
      totalImpact: result.totalImpact,
      totalDuration: result.totalDuration,
      vehiclesConsidered: vehicles.length,
      vehiclesSelected: result.selectedVehicles.length,
      computationTimeMs: elapsed,
    });
  } catch (err) {
    Log("backend", "error", "handler", `unhandled error: ${err.message}`).catch(() => {});
    respond(res, 500, { error: "internal server error", detail: err.message });
  }
}

function readBody(req) {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (chunk) => { data += chunk; });
    req.on("end", () => resolve(data));
  });
}

function respond(res, statusCode, payload) {
  const body = JSON.stringify(payload, null, 2);
  res.writeHead(statusCode, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
}

module.exports = { handleSchedule };
