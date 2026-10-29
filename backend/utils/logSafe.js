/**
 * Makes user-influenced text safe to write to logs: removes line breaks (so a
 * value can't forge extra log lines) and caps the length.
 */
function logSafe(value, maxLength = 300) {
  return String(value ?? '')
    .replace(/[\r\n]+/g, ' ')
    .slice(0, maxLength);
}

module.exports = { logSafe };
