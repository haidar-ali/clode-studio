/**
 * Formatting utility functions
 */

/**
 * Format bytes to human-readable string
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Format time to relative string
 */
export function formatTime(date: Date | string | number): string {
  const d = new Date(date);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  
  if (seconds < 60) {
    return 'just now';
  } else if (minutes < 60) {
    return `${minutes}m ago`;
  } else if (hours < 24) {
    return `${hours}h ago`;
  } else if (days < 7) {
    return `${days}d ago`;
  } else {
    return d.toLocaleDateString();
  }
}

/**
 * Format milliseconds to human-readable duration
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`;
  }
  
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  
  if (seconds < 60) {
    return `${seconds}s`;
  } else if (minutes < 60) {
    return `${minutes}m ${seconds % 60}s`;
  } else {
    return `${hours}h ${minutes % 60}m`;
  }
}

/**
 * Format number with commas
 */
export function formatNumber(num: number): string {
  return num.toLocaleString();
}

/**
 * Format percentage
 */
export function formatPercent(value: number, decimals: number = 0): string {
  return `${value.toFixed(decimals)}%`;
}

/**
 * Truncate string with ellipsis
 */
export function truncate(str: string, length: number): string {
  if (str.length <= length) return str;
  return str.substring(0, length - 3) + '...';
}

/**
 * Format file path for display
 */
export function formatPath(path: string, maxLength: number = 50): string {
  if (path.length <= maxLength) return path;
  
  const parts = path.split('/');
  if (parts.length <= 2) {
    return truncate(path, maxLength);
  }
  
  // Keep first and last parts, abbreviate middle
  const first = parts[0];
  const last = parts[parts.length - 1];
  const middle = '...';
  
  let result = `${first}/${middle}/${last}`;
  if (result.length > maxLength) {
    // If still too long, just truncate the last part
    const availableForLast = maxLength - first.length - middle.length - 2;
    result = `${first}/${middle}/${truncate(last, availableForLast)}`;
  }
  
  return result;
}

/**
 * Format cache key for display
 */
export function formatCacheKey(key: string): string {
  // Remove prefixes for cleaner display
  const prefixes = ['file:', 'api:', 'session:', 'claude:'];
  for (const prefix of prefixes) {
    if (key.startsWith(prefix)) {
      return key.substring(prefix.length);
    }
  }
  return key;
}