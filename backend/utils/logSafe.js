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
    // Insert a space before each run of line breaks so words stay apart, then
    // remove CR and LF with single-character, empty replacements: the exact
    // form CodeQL's log-injection check recognises (it can't analyse a
    // quantified character class).
    .replace(/(?<![\r\n])(?=[\r\n])/g, ' ')
    .replace(/\r/g, '')
    .replace(/\n/g, '')
    .replace(ANSI_SEQUENCE, '')
    .replace(CONTROL_CHARS, ' ')
    .slice(0, maxLength);
}

module.exports = { logSafe };
