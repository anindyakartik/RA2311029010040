/**
 * config.js
 *
 * Central place for every tuneable constant.
 * Auth credentials live here so they are easy to rotate
 * without touching business logic.
 */

const BASE_URL = "http://20.207.122.201/evaluation-service";

module.exports = {
  BASE_URL,
  DEPOTS_URL: `${BASE_URL}/depots`,
  VEHICLES_URL: `${BASE_URL}/vehicles`,

  // Replace these with real values after registration
  AUTH_TOKEN: "Bearer <YOUR_TOKEN_HERE>",

  SERVER_PORT: 4000,
};
