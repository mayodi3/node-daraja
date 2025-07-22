// src/utils.js
// Helper utilities shared across API modules

/**
 * Generates a timestamp in `YYYYMMDDHHMMSS` format as required by Safaricom APIs.
 * @returns {string} The formatted timestamp.
 */
export function _getTimestamp() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");
  return `${year}${month}${day}${hours}${minutes}${seconds}`;
}
