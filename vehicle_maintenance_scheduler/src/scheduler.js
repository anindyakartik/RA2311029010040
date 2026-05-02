const { Log } = require("logging_middleware");

function selectVehicles(vehicles, capacity) {
  const n = vehicles.length;

  Log("backend", "info", "service", `knapsack: ${n} vehicles, capacity ${capacity}h`).catch(() => {});

  if (n === 0 || capacity <= 0) {
    Log("backend", "warn", "service", "nothing to schedule").catch(() => {});
    return { selectedVehicles: [], totalImpact: 0, totalDuration: 0 };
  }

  // durations can be fractional (e.g. 2.5h), multiplying by 100 keeps
  // everything as integers so the DP table stays correct
  const SCALE = 100;
  const cap = Math.round(capacity * SCALE);

  const weights = vehicles.map((v) => Math.round((parseFloat(v.Duration) || 0) * SCALE));
  const values = vehicles.map((v) => parseFloat(v.Impact) || 0);

  // 1-D DP array, rolling over — avoids allocating a full n*cap matrix
  const dp = new Array(cap + 1).fill(0);

  // need this to reconstruct which items were actually picked
  const keep = [];
  for (let i = 0; i < n; i++) keep.push(new Uint8Array(cap + 1));

  for (let i = 0; i < n; i++) {
    // iterate backwards so we don't reuse the same item twice
    for (let w = cap; w >= weights[i]; w--) {
      const candidate = dp[w - weights[i]] + values[i];
      if (candidate > dp[w]) {
        dp[w] = candidate;
        keep[i][w] = 1;
      }
    }
  }

  // walk back through the keep table to find what was selected
  const selected = [];
  let remaining = cap;
  for (let i = n - 1; i >= 0; i--) {
    if (keep[i][remaining]) {
      selected.push(vehicles[i]);
      remaining -= weights[i];
    }
  }

  const totalImpact = dp[cap];
  const totalDuration = selected.reduce((sum, v) => sum + (parseFloat(v.Duration) || 0), 0);

  Log("backend", "info", "service", `knapsack done: ${selected.length} vehicles selected, impact ${totalImpact}`).catch(() => {});

  return {
    selectedVehicles: selected,
    totalImpact,
    totalDuration: Math.round(totalDuration * 100) / 100,
  };
}

module.exports = { selectVehicles };
