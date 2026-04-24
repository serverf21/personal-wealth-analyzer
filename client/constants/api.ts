/**
 * Backend URL for fetch(). Use 127.0.0.1 — browsers often never complete requests to 0.0.0.0.
 * Override with EXPO_PUBLIC_API_URL when deploying.
 */
export const API_BASE =
  typeof process !== "undefined" &&
  process.env.EXPO_PUBLIC_API_URL &&
  String(process.env.EXPO_PUBLIC_API_URL).trim()
    ? String(process.env.EXPO_PUBLIC_API_URL).replace(/\/$/, "")
    : "http://127.0.0.1:8000";
