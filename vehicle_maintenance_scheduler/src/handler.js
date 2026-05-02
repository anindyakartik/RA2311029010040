/**
 * handler.js
 *
 * HTTP request handler for the vehicle maintenance scheduler.
 * Sits between the raw HTTP layer and the business logic.
 */

const dataService = require("./dataService");
const scheduler = require("./scheduler");
const { Log } = require("logging_middleware");

/**
 * Handle a schedule request.
 *
 * Expected query parameter: depotID
 * Example: GET /schedule?depotID=abc-123
 *
 * Alternatively accepts POST with JSON body { "depotID": "..." }
 *
 * @param {http.IncomingMessage} req
 * @param {http.ServerResponse} res
 */
async function handleSchedule(req, res) {
  const startTime = Date.now();

  try {
    // ── extract depotID ──────────────────────────────────────
    let depotID = null;

    const url = new URL(req.url, `http://${req.headers.host}`);
    depotID = url.searchParams.get("depotID");

    if (!depotID && req.method === "POST") {
      const bodyStr = await _readBody(req);
      try {
        const bodyJson = JSON.parse(bodyStr);
        depotID = bodyJson.depotID || bodyJson.depotId || bodyJson.depot_id;
      } catch (_) {
        // body wasn't JSON – that's fine, depotID stays null
      }
    }

    if (!depotID) {
      Log(
        "backend",
        "warn",
        "handler",
        "handleSchedule – request missing depotID parameter"
      ).catch(() => {});
      _respond(res, 400, {
        error: "depotID is required (pass as query param or JSON body)",
      });
      return;
    }

    Log(
      "backend",
      "info",
      "handler",
      `handleSchedule – processing request for depot ${depotID}`
    ).catch(() => {});

    // ── fetch live data ──────────────────────────────────────
    const [depots, vehicles] = await Promise.all([
      dataService.fetchDepots(),
      dataService.fetchVehicles(),
    ]);

    // ── locate the depot ─────────────────────────────────────
    const depot = depots.find(
      (d) =>
        (d.ID || d.id || d.depotID || d.depotId) === depotID
    );

    if (!depot) {
      Log(
        "backend",
        "warn",
        "handler",
        `handleSchedule – depot ${depotID} not found in ${depots.length} depots`
      ).catch(() => {});
      _respond(res, 404, { error: `depot ${depotID} not found` });
      return;
    }

    const capacity =
      parseFloat(depot.Capacity) ||
      parseFloat(depot.capacity) ||
      parseFloat(depot.MechanicHours) ||
      parseFloat(depot.mechanicHours) ||
      parseFloat(depot.Budget) ||
      parseFloat(depot.budget) ||
      0;

    Log(
      "backend",
      "info",
      "handler",
      `handleSchedule – depot ${depotID} has ${capacity} mechanic-hours budget`
    ).catch(() => {});

    // ── filter vehicles that belong to this depot ────────────
    const depotVehicles = vehicles.filter(
      (v) =>
        (v.DepotID || v.depotID || v.depotId || v.depot_id) === depotID
    );

    Log(
      "backend",
      "info",
      "handler",
      `handleSchedule – ${depotVehicles.length} vehicles belong to depot ${depotID}`
    ).catch(() => {});

    // ── run optimisation ─────────────────────────────────────
    const result = scheduler.selectVehicles(depotVehicles, capacity);

    const elapsedMs = Date.now() - startTime;

    Log(
      "backend",
      "info",
      "handler",
      `handleSchedule – returning ${result.selectedVehicles.length} vehicles ` +
        `(impact ${result.totalImpact}, duration ${result.totalDuration}h) ` +
        `in ${elapsedMs}ms`
    ).catch(() => {});

    _respond(res, 200, {
      depotID: depotID,
      capacity: capacity,
      selected: result.selectedVehicles,
      totalImpact: result.totalImpact,
      totalDuration: result.totalDuration,
      vehiclesConsidered: depotVehicles.length,
      vehiclesSelected: result.selectedVehicles.length,
      computationTimeMs: elapsedMs,
    });
  } catch (err) {
    Log(
      "backend",
      "error",
      "handler",
      `handleSchedule – unhandled error: ${err.message}`
    ).catch(() => {});

    _respond(res, 500, { error: "internal server error", detail: err.message });
  }
}

// ── helper: read full request body ─────────────────────────────

function _readBody(req) {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
    });
    req.on("end", () => resolve(data));
  });
}

// ── helper: send JSON response ─────────────────────────────────

function _respond(res, statusCode, payload) {
  const body = JSON.stringify(payload, null, 2);
  res.writeHead(statusCode, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
}

module.exports = { handleSchedule };
