/**
 * config.js
 *
 * Central configuration for the notification microservice.
 */

const BASE_URL = "http://20.207.122.201/evaluation-service";

module.exports = {
  BASE_URL,
  NOTIFICATIONS_URL: `${BASE_URL}/notifications`,

  // Replace with real values after registration
  AUTH_TOKEN: "Bearer <YOUR_TOKEN_HERE>",

  SERVER_PORT: 5000,

  // Priority inbox defaults
  DEFAULT_TOP_N: 10,

  // Type weights for priority scoring
  TYPE_WEIGHTS: {
    Placement: 3,
    Result: 2,
    Event: 1,
  },
};
