// Shared helpers. Pure functions only, so they run in the browser and in `node --test`.

/** Small seeded PRNG (mulberry32) so scenarios are repeatable. */
export function rng(seed = 1) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  next.int = (lo, hi) => lo + Math.floor(next() * (hi - lo + 1));
  next.pick = (arr) => arr[Math.floor(next() * arr.length)];
  next.shuffle = (arr) => {
    const a2 = [...arr];
    for (let i = a2.length - 1; i > 0; i--) {
      const j = Math.floor(next() * (i + 1));
      [a2[i], a2[j]] = [a2[j], a2[i]];
    }
    return a2;
  };
  return next;
}

export const hex2 = (b) => b.toString(16).padStart(2, '0').toUpperCase();
export const hexBytes = (bytes) => Array.from(bytes, hex2).join(' ');

/** Parse "FF D8 ff-e0,00" style hex into bytes. Throws on bad input. */
export function parseHex(text) {
  const clean = String(text).replace(/0x/gi, '').replace(/[^0-9a-f]/gi, '');
  if (clean.length % 2) throw new Error('Hex input has an odd number of digits');
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export function fmtBytes(n) {
  if (n < 1024) return `${n.toLocaleString('en-US')} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(n % 1024 ? 1 : 0)} KiB`;
  return `${(n / 1024 / 1024).toFixed(1)} MiB`;
}

export const printable = (b) => (b >= 0x20 && b < 0x7f ? String.fromCharCode(b) : '.');

/** Classic 16-bytes-per-row hex dump rows: [{offset, hex[], ascii}] */
export function hexRows(bytes, start = 0, length = bytes.length, width = 16) {
  const rows = [];
  const end = Math.min(bytes.length, start + length);
  for (let off = start; off < end; off += width) {
    const slice = bytes.subarray(off, Math.min(end, off + width));
    rows.push({ offset: off, bytes: Array.from(slice), ascii: Array.from(slice, printable).join('') });
  }
  return rows;
}

/** DiskDigger-style grade: green = whole file, white = partial, red = very little left. */
export function grade(good, total) {
  if (total === 0) return 'little';
  if (good === total) return 'full';
  return good / total >= 0.5 ? 'partial' : 'little';
}
