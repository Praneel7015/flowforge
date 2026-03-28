export function decodeEscapedNewlines(value) {
  if (typeof value !== 'string') {
    return '';
  }

  let output = value;

  if (output.startsWith('"') && output.endsWith('"')) {
    try {
      const parsed = JSON.parse(output);
      if (typeof parsed === 'string') {
        output = parsed;
      }
    } catch {
      // Keep original value when it is not a JSON string literal.
    }
  }

  if (!/\r?\n/.test(output) && /\\n/.test(output)) {
    output = output
      .replace(/\\r\\n/g, '\n')
      .replace(/\\n/g, '\n')
      .replace(/\\t/g, '  ')
      .replace(/\\"/g, '"');
  }

  return output;
}

export function extractMarkdownCodeFence(value) {
  if (typeof value !== 'string') {
    return '';
  }

  const normalized = value.replace(/^\uFEFF/, '').trim();
  if (!normalized) {
    return '';
  }

  const fencedMatch = normalized.match(/```(?:[a-zA-Z0-9_-]+)?\s*([\s\S]*?)```/);
  if (fencedMatch && fencedMatch[1]) {
    return fencedMatch[1].trim();
  }

  return normalized;
}

export function normalizeConfigText(value) {
  const decoded = decodeEscapedNewlines(value);
  return extractMarkdownCodeFence(decoded);
}
