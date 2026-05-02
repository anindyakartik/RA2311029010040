/**
 * scheduler.js
 *
 * Contains the bounded-optimisation algorithm that picks the best
 * subset of vehicles to service within a mechanic-hour budget.
 *
 * This is essentially the 0/1 knapsack problem:
 *   - capacity  = depot's daily mechanic hours
 *   - weight_i  = vehicle.Duration  (hours needed)
 *   - value_i   = vehicle.Impact    (importance score)
 *
 * The implementation uses bottom-up dynamic programming.
 * No external libraries are involved.
 */

const { Log } = require("logging_middleware");

/**
 * Run the 0/1 knapsack selection.
 *
 * Because durations may be fractional, we multiply everything by 100
 * and work in integer "centi-hours" so the DP table stays correct.
 * After the selection is made we convert back.
 *
 * @param {Array<Object>} vehicles – each must have Duration and Impact
 * @param {number} capacity – total mechanic-hours available
 * @returns {{ selectedVehicles: Array, totalImpact: number, totalDuration: number }}
 */
function selectVehicles(vehicles, capacity) {
  const n = vehicles.length;

  Log(
    "backend",
    "info",
    "service",
    `scheduler – starting knapsack: ${n} vehicles, capacity ${capacity}h`
  ).catch(() => {});

  if (n === 0 || capacity <= 0) {
    Log(
      "backend",
      "warn",
      "service",
      "scheduler – nothing to schedule (no vehicles or zero capacity)"
    ).catch(() => {});
    return { selectedVehicles: [], totalImpact: 0, totalDuration: 0 };
  }

  // ── scale to integers ────────────────────────────────────────
  const SCALE = 100;
  const cap = Math.round(capacity * SCALE);

  const weights = vehicles.map((v) => {
    const dur = parseFloat(v.Duration) || parseFloat(v.duration) || 0;
    return Math.round(dur * SCALE);
  });

  const values = vehicles.map((v) => {
    return parseFloat(v.Impact) || parseFloat(v.impact) || 0;
  });

  Log(
    "backend",
    "debug",
    "service",
    `scheduler – scaled capacity to ${cap} centi-hours`
  ).catch(() => {});

  // ── DP table ─────────────────────────────────────────────────
  // dp[i][w] = best impact using items 0..i-1 with capacity w
  // To save memory, we use a 1-D array and iterate backwards.

  const dp = new Array(cap + 1).fill(0);

  // We also need to reconstruct which items were chosen.
  // keep[i][w] = true if item i was included at capacity w
  const keep = [];
  for (let i = 0; i < n; i++) {
    keep.push(new Uint8Array(cap + 1)); // defaults to 0
  }

  for (let i = 0; i < n; i++) {
    // iterate capacity backwards so each item is used at most once
    for (let w = cap; w >= weights[i]; w--) {
      const withItem = dp[w - weights[i]] + values[i];
      if (withItem > dp[w]) {
        dp[w] = withItem;
        keep[i][w] = 1;
      }
    }
  }

  // ── back-track to find selected items ────────────────────────
  const selected = [];
  let remaining = cap;

  for (let i = n - 1; i >= 0; i--) {
    if (keep[i][remaining]) {
      selected.push(vehicles[i]);
      remaining -= weights[i];
    }
  }

  const totalImpact = dp[cap];
  const totalDuration = selected.reduce((sum, v) => {
    const dur = parseFloat(v.Duration) || parseFloat(v.duration) || 0;
    return sum + dur;
  }, 0);

  Log(
    "backend",
    "info",
    "service",
    `scheduler – knapsack complete: selected ${selected.length} vehicles, ` +
      `total impact ${totalImpact}, total duration ${totalDuration}h`
  ).catch(() => {});

  return {
    selectedVehicles: selected,
    totalImpact: totalImpact,
    totalDuration: Math.round(totalDuration * 100) / 100,
  };
}

module.exports = { selectVehicles };
