/**
 * Makes user-influenced text safe to write to logs: drops ANSI escape
 * sequences and every other control character (line breaks included, so a
 * value can't forge extra log lines or drive the reader's terminal), then
 * caps the length.
 */
/* eslint-disable no-control-regex -- matching control characters is the point of this file */
const ANSI_SEQUENCE = /\u001b\[[0-9;?]*[ -/]*[@-~]/g;
const CONTROL_CHARS = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]+/g;
/* eslint-enable no-control-regex */

function logSafe(value, maxLength = 300) {
  return String(value ?? '')
    .replace(ANSI_SEQUENCE, '')
    .replace(CONTROL_CHARS, ' ')
    .slice(0, maxLength);
}

module.exports = { logSafe };
