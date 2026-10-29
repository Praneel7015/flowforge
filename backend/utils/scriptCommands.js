/**
 * A node's `config.script` is either a legacy newline-separated string (one
 * command per line) or an array of commands, where one entry may span several
 * lines (an `if ...; then ... fi` block, a heredoc). These helpers keep both
 * shapes working and never split a multi-line entry back into lines.
 */

/**
 * Tidy one command without changing what it runs: drop the blank lines around
 * it and the indentation every line shares. Only the outer whitespace goes;
 * the lines in between are kept as written.
 * @param {string} text
 * @returns {string}
 */
function normalizeCommand(text) {
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

/**
 * Expand a script config into its list of commands.
 * @param {string|string[]|undefined} script
 * @returns {string[]}
 */
function toCommandList(script) {
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

/**
 * Store commands in the legacy string shape when every command is one line,
 * and as an array only when a multi-line command has to stay whole.
 * @param {string[]} commands
 * @returns {string|string[]}
 */
function toScriptConfig(commands) {
  const list = (commands || []).map(normalizeCommand).filter(Boolean);
  return list.some((command) => command.includes('\n')) ? list : list.join('\n');
}

module.exports = { normalizeCommand, toCommandList, toScriptConfig };
