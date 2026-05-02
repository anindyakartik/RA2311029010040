const httpClient = require("./httpClient");
const config = require("./config");
const { Log } = require("logging_middleware");

async function fetchDepots() {
  Log("backend", "info", "service", "fetching depots from evaluation API").catch(() => {});

  const res = await httpClient.get(config.DEPOTS_URL, { Authorization: config.AUTH_TOKEN });

  if (res.statusCode !== 200) {
    const msg = `depots endpoint returned ${res.statusCode}`;
    Log("backend", "error", "service", msg).catch(() => {});
    throw new Error(msg);
  }

  const parsed = JSON.parse(res.body);
  const depots = parsed.depots || parsed.data || parsed;

  Log("backend", "info", "service", `fetched ${depots.length} depots`).catch(() => {});
  return depots;
}

async function fetchVehicles() {
  Log("backend", "info", "service", "fetching vehicles from evaluation API").catch(() => {});

  const res = await httpClient.get(config.VEHICLES_URL, { Authorization: config.AUTH_TOKEN });

  if (res.statusCode !== 200) {
    const msg = `vehicles endpoint returned ${res.statusCode}`;
    Log("backend", "error", "service", msg).catch(() => {});
    throw new Error(msg);
  }

  const parsed = JSON.parse(res.body);
  const vehicles = parsed.vehicles || parsed.data || parsed;

  Log("backend", "info", "service", `fetched ${vehicles.length} vehicles`).catch(() => {});
  return vehicles;
}

module.exports = { fetchDepots, fetchVehicles };
