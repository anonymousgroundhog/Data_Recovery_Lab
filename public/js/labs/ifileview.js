import { h, hexDump, table } from './ui.js';
import { parseIFile, I_FIELDS } from '../core/recyclebin.js';
import { hexBytes } from '../core/util.js';

const CLS = { header: 'f-header', size: 'f-size', time: 'f-time', path: 'f-path' };

/** Hex dump of a $I file with each field coloured, plus the decoded values. */
export function iFileView(bytes, { rows = 6 } = {}) {
  let p;
  let err = null;
  try {
    p = parseIFile(bytes);
  } catch (e) {
    err = e.message;
  }
  const classOf = (i) => {
    if (p?.version === 2) {
      if (i < 8) return CLS.header;
      if (i < 16) return CLS.size;
      if (i < 24) return CLS.time;
      if (i < 28) return 'f-header';
      return CLS.path;
    }
    const f = I_FIELDS.find((x) => i >= x.from && i <= x.to);
    return f ? CLS[f.key] : '';
  };
  const pathBytes = p ? (p.path.length + 1) * 2 : 0;
  const showLen = Math.min(bytes.length, Math.max(rows * 16, Math.ceil(((p?.pathStart ?? 24) + pathBytes) / 16) * 16));
  const sl = (a, b) => hexBytes(bytes.subarray(a, b));
  return h('div', null,
    hexDump(bytes, { length: showLen, classOf }),
    bytes.length > showLen ? h('div', { class: 'muted small' }, `… bytes ${showLen}–${bytes.length - 1} are zero padding (total ${bytes.length} bytes)`) : null,
    err ? h('div', { class: 'note bad' }, err) : table(['Bytes', 'Field', 'Raw (little-endian)', 'Decoded'], [
      h('tr', null, h('td', null, '0–7'), h('td', null, h('span', { class: 'b f-header' }, 'Header')), h('td', { class: 'mono small' }, sl(0, 8)), h('td', null, `version ${p.version}${p.version === 2 ? ' (Windows 10+)' : ' (Vista – 8.1)'}`)),
      h('tr', null, h('td', null, '8–15'), h('td', null, h('span', { class: 'b f-size' }, 'Original size')), h('td', { class: 'mono small' }, sl(8, 16)), h('td', null, `${p.size.toLocaleString('en-US')} bytes  (0x${p.size.toString(16).toUpperCase()})`)),
      h('tr', null, h('td', null, '16–23'), h('td', null, h('span', { class: 'b f-time' }, 'Deleted at')), h('td', { class: 'mono small' }, sl(16, 24)), h('td', null, `${p.deletedAt.toISOString().replace('T', ' ').replace('.000Z', ' UTC')}`, h('div', { class: 'muted small' }, `FILETIME ${p.filetime} = 100-ns ticks since 1601-01-01`))),
      p.version === 2 ? h('tr', null, h('td', null, '24–27'), h('td', null, 'Name length'), h('td', { class: 'mono small' }, sl(24, 28)), h('td', null, `${new DataView(bytes.buffer, bytes.byteOffset).getUint32(24, true)} UTF-16 chars`)) : null,
      h('tr', null, h('td', null, p.version === 2 ? '28–…' : '24–543'), h('td', null, h('span', { class: 'b f-path' }, 'Original path')), h('td', { class: 'mono small' }, sl(p.pathStart, p.pathStart + 12) + ' …'), h('td', null, h('code', null, p.path))),
    ]));
}
