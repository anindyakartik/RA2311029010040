/**
 * dataService.js
 *
 * Responsible for pulling live depot and vehicle data from the
 * evaluation server. Nothing is cached or hard-coded – every
 * request hits the remote origin so results stay current.
 */

const httpClient = require("./httpClient");
const config = require("./config");
const { Log } = require("logging_middleware");

/**
 * Fetch every depot from the evaluation API.
 *
 * @returns {Promise<Array>} – array of depot objects
 */
async function fetchDepots() {
  Log(
    "backend",
    "info",
    "service",
    "dataService – fetching depot list from evaluation server"
  ).catch(() => {});

  const res = await httpClient.get(config.DEPOTS_URL, {
    Authorization: config.AUTH_TOKEN,
  });

  if (res.statusCode !== 200) {
    const msg = `dataService – depots endpoint returned ${res.statusCode}`;
    Log("backend", "error", "service", msg).catch(() => {});
    throw new Error(msg);
  }

  const parsed = JSON.parse(res.body);
  // the API may wrap the array in different keys – handle both shapes
  const depots = parsed.depots || parsed.data || parsed;

  Log(
    "backend",
    "info",
    "service",
    `dataService – received ${Array.isArray(depots) ? depots.length : 0} depots`
  ).catch(() => {});

  return depots;
}

/**
 * Fetch every vehicle from the evaluation API.
 *
 * @returns {Promise<Array>} – array of vehicle objects
 */
async function fetchVehicles() {
  Log(
    "backend",
    "info",
    "service",
    "dataService – fetching vehicle list from evaluation server"
  ).catch(() => {});

  const res = await httpClient.get(config.VEHICLES_URL, {
    Authorization: config.AUTH_TOKEN,
  });

  if (res.statusCode !== 200) {
    const msg = `dataService – vehicles endpoint returned ${res.statusCode}`;
    Log("backend", "error", "service", msg).catch(() => {});
    throw new Error(msg);
  }

  const parsed = JSON.parse(res.body);
  const vehicles = parsed.vehicles || parsed.data || parsed;

  Log(
    "backend",
    "info",
    "service",
    `dataService – received ${Array.isArray(vehicles) ? vehicles.length : 0} vehicles`
  ).catch(() => {});

  return vehicles;
}

module.exports = { fetchDepots, fetchVehicles };
