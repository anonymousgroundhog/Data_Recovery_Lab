// Windows Recycle Bin artifacts: XP INFO2-era names and the Vista+ $I / $R pair.

// Seconds between 1601-01-01 (Windows FILETIME epoch) and 1970-01-01 (Unix epoch).
export const EPOCH_GAP_SECONDS = 11644473600n;
export const I_FILE_SIZE = 544;
export const MAX_PATH = 260;

/** Date → FILETIME (count of 100-nanosecond intervals since Jan 1, 1601 UTC). */
export function toFiletime(date) {
  return (BigInt(date.getTime()) + EPOCH_GAP_SECONDS * 1000n) * 10000n;
}

export function fromFiletime(ft) {
  return new Date(Number(BigInt(ft) / 10000n - EPOCH_GAP_SECONDS * 1000n));
}

/** Build a 544-byte version-1 $I file (Vista – 8.1 layout from the slides). */
export function buildIFile({ path, size, deletedAt }) {
  if (!path) throw new Error('Original path required');
  if (path.length >= MAX_PATH) throw new Error(`Path longer than ${MAX_PATH - 1} characters`);
  const buf = new Uint8Array(I_FILE_SIZE);
  const dv = new DataView(buf.buffer);
  dv.setBigUint64(0, 1n, true); // header: 01 00 00 00 00 00 00 00
  dv.setBigUint64(8, BigInt(size), true);
  dv.setBigUint64(16, toFiletime(deletedAt), true);
  for (let i = 0; i < path.length; i++) dv.setUint16(24 + i * 2, path.charCodeAt(i), true);
  return buf;
}

/** Parse a $I file. Understands version 1 (fixed 544 bytes) and version 2 (Windows 10+, variable length). */
export function parseIFile(bytes) {
  if (bytes.length < 24) throw new Error(`Too short: ${bytes.length} bytes (need at least 24)`);
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const version = Number(dv.getBigUint64(0, true));
  const size = dv.getBigUint64(8, true);
  const filetime = dv.getBigUint64(16, true);
  let pathStart = 24;
  let maxChars = MAX_PATH;
  if (version === 2) {
    if (bytes.length < 28) throw new Error('Version 2 $I file truncated before name length');
    maxChars = dv.getUint32(24, true);
    pathStart = 28;
  } else if (version !== 1) {
    throw new Error(`Unknown header version ${version} – expected 01 00 00 00 00 00 00 00`);
  }
  let path = '';
  for (let i = 0; i < maxChars && pathStart + i * 2 + 1 < bytes.length; i++) {
    const ch = dv.getUint16(pathStart + i * 2, true);
    if (ch === 0) break;
    path += String.fromCharCode(ch);
  }
  return {
    version, size, filetime, deletedAt: fromFiletime(filetime), path, pathStart,
    lengthOk: version === 1 ? bytes.length === I_FILE_SIZE : true,
  };
}

/** Byte ranges used to colour a version-1 hex dump. */
export const I_FIELDS = [
  { from: 0, to: 7, key: 'header', label: 'Header (version 1)' },
  { from: 8, to: 15, key: 'size', label: 'Original size (little-endian)' },
  { from: 16, to: 23, key: 'time', label: 'Deletion time (FILETIME)' },
  { from: 24, to: 543, key: 'path', label: 'Original path (UTF-16LE)' },
];

/** Windows 2000/XP name inside RECYCLER\%SID%: D<drive letter><index>.<ext> */
export function info2Name(originalPath, index) {
  const m = /^([A-Za-z]):\\/.exec(originalPath);
  if (!m) throw new Error('Path must start with a drive letter, e.g. C:\\');
  const base = originalPath.split('\\').pop();
  const dot = base.lastIndexOf('.');
  const ext = dot > 0 ? base.slice(dot) : ''; // folders / extension-less files keep no extension
  return `D${m[1].toLowerCase()}${index}${ext}`;
}

/** Vista+ pair: $Rxxxxxx.ext (the data) and $Ixxxxxx.ext (544-byte metadata). */
export function vistaNames(originalPath, rand) {
  const base = originalPath.split('\\').pop();
  const dot = base.lastIndexOf('.');
  const ext = dot > 0 ? base.slice(dot) : '';
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let id = '';
  for (let i = 0; i < 6; i++) id += chars[Math.floor(rand() * chars.length)];
  return { r: `$R${id}${ext}`, i: `$I${id}${ext}`, id };
}

/** Hex string of a BigInt as the 8 little-endian bytes a hex editor would show. */
export function leBytes(value) {
  const b = new Uint8Array(8);
  new DataView(b.buffer).setBigUint64(0, BigInt(value), true);
  return b;
}
