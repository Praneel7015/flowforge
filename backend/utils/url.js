/**
 * Removes trailing "/" characters in linear time. `/\/+$/` backtracks
 * quadratically on long runs of slashes that aren't at the end of a
 * user-supplied URL.
 */
function trimTrailingSlashes(value) {
  const text = String(value);
  let end = text.length;
  while (end > 0 && text[end - 1] === '/') end -= 1;
  return text.slice(0, end);
}

function invalidPath() {
  const error = new Error('Invalid path segment in request');
  error.status = 400;
  error.expose = true;
  return error;
}

/**
 * Encodes one user-supplied URL path segment (owner, repo, id, ...). "." and
 * ".." are rejected so a value can't walk the request to a different API
 * endpoint (path traversal).
 */
function pathSegment(value) {
  const text = String(value ?? '');
  if (!text || text === '.' || text === '..') throw invalidPath();
  return encodeURIComponent(text);
}

/**
 * Encodes a slash-separated value (branch like "feature/x", file path),
 * segment by segment, with the same "."/".." rule. Empty input stays empty.
 */
function pathSegments(value) {
  const text = String(value ?? '');
  if (!text) return '';
  return text
    .split('/')
    .filter((part, index, parts) => part !== '' || (index > 0 && index < parts.length - 1))
    .map((part) => {
      if (part === '.' || part === '..') throw invalidPath();
      return encodeURIComponent(part);
    })
    .join('/');
}

module.exports = { trimTrailingSlashes, pathSegment, pathSegments };
