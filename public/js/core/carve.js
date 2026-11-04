// File carving: build a raw disk image, then find files by header/footer signatures.
import { rng, hexBytes } from './util.js';

export const SECTOR = 512;

// `short` is the 2-byte header from the slide table; `header` is the fuller magic number.
export const SIGNATURES = [
  { type: 'JPEG', ext: 'jpg', short: [0xff, 0xd8], header: [0xff, 0xd8, 0xff, 0xe0], footer: [0xff, 0xd9], max: 12 * SECTOR },
  { type: 'PNG', ext: 'png', short: [0x89, 0x50], header: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], footer: [0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82], max: 12 * SECTOR },
  { type: 'GIF', ext: 'gif', short: [0x47, 0x49], header: [0x47, 0x49, 0x46, 0x38, 0x39, 0x61], footer: [0x00, 0x3b], max: 8 * SECTOR },
  { type: 'PDF', ext: 'pdf', short: [0x25, 0x50], header: [0x25, 0x50, 0x44, 0x46, 0x2d], footer: [0x25, 0x25, 0x45, 0x4f, 0x46, 0x0a], max: 12 * SECTOR },
  { type: 'ZIP', ext: 'zip', short: [0x50, 0x4b], header: [0x50, 0x4b, 0x03, 0x04], footer: [0x50, 0x4b, 0x05, 0x06], footerExtra: 18, max: 12 * SECTOR },
  { type: 'BMP', ext: 'bmp', short: [0x42, 0x4d], header: [0x42, 0x4d], sizeField: 2, max: 12 * SECTOR },
  { type: 'EXE', ext: 'exe', short: [0x4d, 0x5a], header: [0x4d, 0x5a, 0x90, 0x00], max: 6 * SECTOR },
  { type: 'MP3', ext: 'mp3', short: [0x49, 0x44], header: [0x49, 0x44, 0x33], max: 8 * SECTOR },
  { type: 'WAV', ext: 'wav', short: [0x52, 0x49], header: [0x52, 0x49, 0x46, 0x46], sizeField: 4, sizeAdd: 8, max: 12 * SECTOR },
];

export const sig = (type) => SIGNATURES.find((s) => s.type === type);

const ALL_PATTERNS = SIGNATURES.flatMap((s) => [s.header, s.footer, s.short].filter(Boolean));

function matchAt(bytes, i, pattern) {
  if (i + pattern.length > bytes.length) return false;
  for (let k = 0; k < pattern.length; k++) if (bytes[i + k] !== pattern[k]) return false;
  return true;
}

export function indexOf(bytes, pattern, from = 0, to = bytes.length) {
  for (let i = from; i <= Math.min(to, bytes.length) - pattern.length; i++) if (matchAt(bytes, i, pattern)) return i;
  return -1;
}

/** Random filler that contains no header/footer patterns, so carving results are predictable. */
function filler(r, n) {
  const b = new Uint8Array(n);
  for (let i = 0; i < n; i++) b[i] = r.int(1, 0xfe);
  for (let pass = 0; pass < 6; pass++) {
    let dirty = false;
    for (let i = 0; i < n; i++) {
      for (const p of ALL_PATTERNS) {
        if (matchAt(b, i, p)) {
          b[i] = b[i] === 0x11 ? 0x12 : 0x11;
          dirty = true;
        }
      }
    }
    if (!dirty) break;
  }
  return b;
}

function buildFile(r, type, size) {
  const s = sig(type);
  const b = filler(r, size);
  b.set(s.header, 0);
  if (s.sizeField != null) new DataView(b.buffer).setUint32(s.sizeField, size - (s.sizeAdd ?? 0), true);
  if (type === 'WAV') b.set([0x57, 0x41, 0x56, 0x45], 8);
  if (s.footer) b.set(s.footer, size - s.footer.length - (s.footerExtra ?? 0));
  return b;
}

const TEXT = [
  'Dear Sam,',
  'The BMW parts invoice is attached. Our MZ-3 supplier says the RIFF between',
  'shipping and billing is settled, so PK (pack) the order by Friday. Send the',
  'GIF of the logo and a copy of your ID badge. I could not open the %PDF you sent;',
  'please resend it. Thanks!  -- Pat',
].join('\n');

/**
 * Lay out a 64-sector image. Each placement records the truth so carving can be graded.
 * meta = 'intact' (file system still names it), 'deleted' (dir entry marked deleted, name known) or 'lost' (metadata gone).
 */
export function buildImage(seed = 360) {
  const r = rng(seed);
  const sectors = 64;
  const img = new Uint8Array(sectors * SECTOR);
  const owner = new Array(sectors).fill(null);
  const files = [];
  const put = (sector, bytes, label) => {
    img.set(bytes, sector * SECTOR);
    for (let s = 0; s < Math.ceil(bytes.length / SECTOR); s++) owner[sector + s] = label;
  };
  // Sector 0: a little "file system" area (boot/dir). Sectors 1–2: a text document.
  const boot = filler(r, SECTOR);
  boot.set([0x55, 0xaa], 510);
  put(0, boot, { kind: 'fs', label: 'Boot / directory' });
  const text = new Uint8Array(2 * SECTOR).fill(0x20);
  text.set(new TextEncoder().encode(TEXT));
  put(1, text, { kind: 'text', label: 'letter.txt (text)' });

  const plan = [
    { type: 'JPEG', name: 'beach.jpg', at: 3, size: 4 * SECTOR - 37, meta: 'intact' },
    { type: 'PDF', name: 'contract.pdf', at: 8, size: 3 * SECTOR - 100, meta: 'deleted' },
    { type: 'PNG', name: 'diagram.png', at: 12, size: 2 * SECTOR + 211, meta: 'lost' },
    { type: 'ZIP', name: 'archive.zip', at: 16, size: 4 * SECTOR - 60, meta: 'deleted' },
    { type: 'GIF', name: 'logo.gif', at: 21, size: SECTOR + 99, meta: 'lost' },
    { type: 'BMP', name: 'scan.bmp', at: 24, size: 3 * SECTOR, meta: 'lost' },
    { type: 'EXE', name: 'setup.exe', at: 28, size: 2 * SECTOR, meta: 'intact' },
    { type: 'WAV', name: 'voicemail.wav', at: 31, size: 3 * SECTOR - 12, meta: 'deleted' },
    { type: 'MP3', name: 'song.mp3', at: 35, size: 3 * SECTOR, meta: 'lost' },
  ];
  for (const p of plan) {
    const bytes = buildFile(r, p.type, p.size);
    put(p.at, bytes, { kind: 'file', label: p.name, type: p.type });
    files.push({ ...p, start: p.at * SECTOR, end: p.at * SECTOR + p.size, status: 'contiguous' });
  }
  // Fragmented JPEG: first half at 40–41, a foreign sector at 42, second half at 43–44.
  const frag = buildFile(r, 'JPEG', 4 * SECTOR - 50);
  put(40, frag.subarray(0, 2 * SECTOR), { kind: 'file', label: 'evidence.jpg (part 1)', type: 'JPEG' });
  put(42, filler(r, SECTOR), { kind: 'junk', label: 'other data' });
  put(43, frag.subarray(2 * SECTOR), { kind: 'file', label: 'evidence.jpg (part 2)', type: 'JPEG' });
  files.push({ type: 'JPEG', name: 'evidence.jpg', at: 40, size: frag.length, start: 40 * SECTOR, end: 45 * SECTOR - 50, meta: 'lost', status: 'fragmented' });
  // Partly overwritten PDF: header survives, the end (with the footer) was overwritten by zeros.
  const pdf = buildFile(r, 'PDF', 5 * SECTOR - 77);
  put(47, pdf.subarray(0, 2 * SECTOR), { kind: 'file', label: 'taxes.pdf (start)', type: 'PDF' });
  put(49, new Uint8Array(3 * SECTOR), { kind: 'zero', label: 'zeroed (overwritten)' });
  files.push({ type: 'PDF', name: 'taxes.pdf', at: 47, size: pdf.length, start: 47 * SECTOR, end: 47 * SECTOR + pdf.length, meta: 'deleted', status: 'overwritten' });
  // Remaining sectors: random unallocated junk.
  for (let s = 0; s < sectors; s++) if (!owner[s]) put(s, filler(r, SECTOR), { kind: 'junk', label: 'unallocated' });
  return { img, sectors, owner, files };
}

/**
 * Carve like Scalpel: look for headers (every byte, or only at sector starts), then for the
 * footer, a size field, or stop at the type's maximum size.
 */
export function carve(img, { types = SIGNATURES.map((s) => s.type), aligned = true, shortHeaders = false } = {}) {
  const found = [];
  const active = SIGNATURES.filter((s) => types.includes(s.type));
  const step = aligned ? SECTOR : 1;
  for (let i = 0; i < img.length; i += step) {
    for (const s of active) {
      const head = shortHeaders ? s.short : s.header;
      if (!matchAt(img, i, head)) continue;
      let end;
      let endedBy;
      if (s.sizeField != null && i + s.sizeField + 4 <= img.length) {
        const len = new DataView(img.buffer, img.byteOffset).getUint32(i + s.sizeField, true) + (s.sizeAdd ?? 0);
        if (len > head.length && len <= s.max) {
          end = i + len;
          endedBy = 'size field';
        }
      }
      if (end == null && s.footer) {
        const f = indexOf(img, s.footer, i + head.length, i + s.max);
        if (f >= 0) {
          end = f + s.footer.length + (s.footerExtra ?? 0);
          endedBy = 'footer';
        }
      }
      if (end == null) {
        end = Math.min(img.length, i + s.max);
        endedBy = 'max size';
      }
      found.push({ type: s.type, ext: s.ext, start: i, end, length: end - i, endedBy });
    }
  }
  return found.map((f, k) => ({ ...f, name: `${String(k).padStart(8, '0')}.${f.ext}` }));
}

/** Compare carved results with the truth. */
export function gradeCarve(found, files) {
  return found.map((f) => {
    const t = files.find((x) => x.start === f.start && x.type === f.type);
    if (!t) return { ...f, verdict: 'false positive', truth: null };
    if (t.status === 'fragmented') return { ...f, verdict: 'corrupt (fragmented – includes a foreign sector)', truth: t };
    if (t.status === 'overwritten') return { ...f, verdict: 'partial (footer overwritten – stopped at max size)', truth: t };
    if (t.end === f.end) return { ...f, verdict: 'full', truth: t };
    if (f.end > t.end) return { ...f, verdict: 'full + trailing junk (no footer – carved to max size)', truth: t };
    return { ...f, verdict: 'truncated', truth: t };
  });
}

export function signatureTable() {
  return SIGNATURES.map((s) => ({ type: s.type, short: hexBytes(s.short), header: hexBytes(s.header), footer: s.footer ? hexBytes(s.footer) : s.sizeField != null ? 'size in header' : '— (max size)' }));
}
