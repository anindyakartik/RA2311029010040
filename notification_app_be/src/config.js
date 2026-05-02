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
  AUTH_TOKEN: "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJNYXBDbGFpbXMiOnsiYXVkIjoiaHR0cDovLzIwLjI0NC41Ni4xNDQvZXZhbHVhdGlvbi1zZXJ2aWNlIiwiZW1haWwiOiJhazA5MzlAc3JtaXN0LmVkdS5pbiIsImV4cCI6MTc3NzcwNzM4NCwiaWF0IjoxNzc3NzA2NDg0LCJpc3MiOiJBZmZvcmQgTWVkaWNhbCBUZWNobm9sb2dpZXMgUHJpdmF0ZSBMaW1pdGVkIiwianRpIjoiOGYxMDQyYjktN2Y3OC00NTllLWJiZGYtNDdkMzViZTFlMmY0IiwibG9jYWxlIjoiZW4tSU4iLCJuYW1lIjoiYW5pbmR5YSBrYXJ0aWsiLCJzdWIiOiIzMDExOThiOS1iNWQzLTQxNDUtYTM3Ni00OWQ0OTU0YjViMGMifSwiZW1haWwiOiJhazA5MzlAc3JtaXN0LmVkdS5pbiIsIm5hbWUiOiJhbmluZHlhIGthcnRpayIsInJvbGxObyI6InJhMjMxMTAyOTAxMDA0MCIsImFjY2Vzc0NvZGUiOiJRa2JweEgiLCJjbGllbnRJRCI6IjMwMTE5OGI5LWI1ZDMtNDE0NS1hMzc2LTQ5ZDQ5NTRiNWIwYyIsImNsaWVudFNlY3JldCI6IkZFVWZLY2tKWVJobm52S1AifQ.Gj2Vgf-Grc82Y-BdrB7iDz2NZVHUNnB-D4pH73-iccc",

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
