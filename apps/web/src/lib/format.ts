const UNITS = ['B', 'KB', 'MB', 'GB', 'TB'] as const;

/**
 * Human-readable byte count.
 *
 * Deliberately locale-independent: file sizes are read as technical values,
 * and translating the units invites drift between the tray and the message
 * bubble showing the same file.
 */
export const formatBytes = (bytes: number | null | undefined): string => {
  if (bytes === null || bytes === undefined || Number.isNaN(bytes)) return '';
  if (bytes < 1024) return `${bytes} ${UNITS[0]}`;

  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), UNITS.length - 1);
  const value = bytes / 1024 ** exponent;

  // One decimal below 10 (`1.4 MB`), none above (`230 MB`) — enough precision
  // to matter without pretending to a byte-level accuracy nobody needs.
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${UNITS[exponent]}`;
};
