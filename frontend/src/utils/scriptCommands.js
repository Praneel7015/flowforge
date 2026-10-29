/**
 * A node's `config.script` is either a legacy newline-separated string (one
 * command per line) or an array of commands, where one entry may span several
 * lines (an `if ...; then ... fi` block, a heredoc). Mirrors
 * backend/utils/scriptCommands.js so the canvas and the generators agree.
 */

/** Drop the blank lines around a command and the indentation its lines share. */
export function normalizeCommand(text) {
  const lines = String(text ?? '').replace(/\r\n?/g, '\n').split('\n');
  const isBlank = (line) => line.trim() === '';
  while (lines.length && isBlank(lines[0])) lines.shift();
  while (lines.length && isBlank(lines[lines.length - 1])) lines.pop();
  if (!lines.length) return '';

  let indent = Infinity;
  for (const line of lines) {
    if (!isBlank(line)) indent = Math.min(indent, line.length - line.trimStart().length);
  }
  return lines.map((line) => line.slice(indent)).join('\n').trimEnd();
}

/** The list of commands a script config runs. */
export function toCommandList(script) {
  if (Array.isArray(script)) {
    return script
      .map((entry) => (typeof entry === 'string' ? normalizeCommand(entry) : ''))
      .filter(Boolean);
  }
  if (typeof script === 'string') {
    return script
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
  }
  return [];
}

/** True when the script is stored as a list of commands rather than a legacy string. */
export function isCommandArray(script) {
  return Array.isArray(script);
}

/** The first non-blank line the script runs, for one-line previews. */
export function firstScriptLine(script) {
  const [first] = toCommandList(script);
  return first ? first.split('\n')[0].trim() : '';
}
