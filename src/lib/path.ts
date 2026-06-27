/**
 * Cross-platform path utilities for the frontend.
 *
 * Tauri IPC sends platform-native paths (forward slashes on Unix,
 * backslashes on Windows). These helpers operate on both formats
 * without needing Node.js `path`.
 */

export const isWindows = typeof navigator !== 'undefined' && /Win/i.test(navigator.platform);

/** Platform path separator. */
export const SEP = isWindows ? '\\' : '/';

/**
 * Join path segments with the platform separator.
 * Empty segments are filtered out.
 */
export function join(...segments: string[]): string {
  return segments.filter(Boolean).join(SEP);
}

/**
 * Return the directory name (parent path) of a file path.
 * Strips trailing separators, then returns everything before the last separator.
 * Returns `'.'` if no parent exists.
 */
export function dirname(path: string): string {
  const normalized = path.replace(/[/\\]+$/, '');
  const lastSep = Math.max(normalized.lastIndexOf('/'), normalized.lastIndexOf('\\'));
  if (lastSep === -1) return '.';
  return normalized.substring(0, lastSep);
}

/**
 * Return the last path component (file or directory name).
 * Strips trailing separators first.
 */
export function basename(path: string): string {
  const normalized = path.replace(/[/\\]+$/, '');
  const lastSep = Math.max(normalized.lastIndexOf('/'), normalized.lastIndexOf('\\'));
  if (lastSep === -1) return normalized;
  return normalized.substring(lastSep + 1);
}
