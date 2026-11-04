import { h, clear, panel, header, btn, note, table, tag, hexDump } from './ui.js';
import { buildImage, carve, gradeCarve, SIGNATURES, SECTOR, signatureTable } from '../core/carve.js';
import { fmtBytes, hexBytes } from '../core/util.js';

const KIND_COLOR = { fs: 'var(--line)', text: 'var(--violet-soft)', junk: 'var(--cell-free)', zero: 'var(--panel)' };
const TYPE_COLOR = { JPEG: '#58a6ff', PNG: '#3fb950', GIF: '#e3b341', PDF: '#ff7b72', ZIP: '#bc8cff', BMP: '#39c5cf', EXE: '#f778ba', MP3: '#ffa657', WAV: '#7ee787' };

export default {
  id: 'carving', icon: '🪓', group: 'Carving & Damage', title: 'File Carving & DiskDigger', slides: 'File Carving · DiskDigger: Dig Deep vs. Dig Deeper · Scalpel',
  blurb: 'Hunt headers/footers in a raw image, compare Dig Deep with Dig Deeper, and see false positives and fragmentation bite.',
  lead: 'When metadata is gone, <strong>carving</strong> finds files by their <em>signatures</em>: a header such as <code>FF D8</code> (JPEG) and, if the format has one, a footer. Everything between them is extracted – right or wrong.',
  mount(main) {
    const img = buildImage(360);
    let curSector = 3;
    let results = null;
    let mode = 'deeper';
    const opts = { aligned: true, shortHeaders: false, types: new Set(SIGNATURES.map((s) => s.type)) };
    const mapEl = h('div', { class: 'diskmap', style: { gridTemplateColumns: 'repeat(auto-fill, minmax(34px, 1fr))' } });
    const hexEl = h('div');
    const resEl = h('div');
    const idEl = h('div');

    function sectorColor(s) {
      const o = img.owner[s];
      return o.kind === 'file' ? TYPE_COLOR[o.type] : KIND_COLOR[o.kind];
    }

    function drawMap() {
      const carvedSectors = new Map();
      for (const r of results ?? []) for (let s = Math.floor(r.start / SECTOR); s < Math.ceil(r.end / SECTOR); s++) if (!carvedSectors.has(s)) carvedSectors.set(s, r.verdict === 'full' || r.verdict?.startsWith('full'));
      clear(mapEl, Array.from({ length: img.sectors }, (_, s) => {
        const o = img.owner[s];
        let cls = `cell clickable ${s === curSector ? 'hl' : ''}`;
        if (carvedSectors.has(s)) cls += carvedSectors.get(s) ? ' ok-mark' : ' x-mark';
        return h('div', { class: cls, style: { background: sectorColor(s), minHeight: '34px' }, title: `Sector ${s} (offset 0x${(s * SECTOR).toString(16).toUpperCase()})\n${o.label}`, onclick: () => { curSector = s; drawMap(); drawHex(); } }, h('span', { class: 'no' }, s));
      }));
    }

    function drawHex() {
      const start = curSector * SECTOR;
      const sigAt = new Map();
      const scan = (pattern, cls, from, to) => {
        for (let i = from; i <= to - pattern.length; i++) {
          let m = true;
          for (let k = 0; k < pattern.length && m; k++) m = img.img[i + k] === pattern[k];
          if (m) for (let k = 0; k < pattern.length; k++) sigAt.set(i + k, cls);
        }
      };
      for (const s of SIGNATURES) {
        scan(opts.shortHeaders ? s.short : s.header, 'f-sig', start, start + SECTOR);
        if (s.footer) scan(s.footer, 'f-foot', start, start + SECTOR);
      }
      const o = img.owner[curSector];
      clear(hexEl,
        h('div', { class: 'row' }, h('b', null, `Sector ${curSector}`), h('span', { class: 'muted small' }, `offset ${start} (0x${start.toString(16).toUpperCase()})`), tag(o.label, o.kind === 'file' ? 'info' : '')),
        hexDump(img.img, { start, length: SECTOR, classOf: (i) => sigAt.get(i) }),
        h('div', { class: 'legend' }, h('span', null, h('span', { class: 'b f-sig' }, ' header ')), h('span', null, h('span', { class: 'b f-foot' }, ' footer '))));
    }

    function digDeep() {
      mode = 'deep';
      results = null;
      const named = img.files.filter((f) => f.meta !== 'lost');
      clear(resEl,
        note('info', h('b', null, 'Dig Deep'), ' reads the file system: it lists live and deleted directory entries, so you get ', h('b', null, 'real file names'), ' – but files whose metadata is gone are invisible.'),
        table(['Name', 'Type', 'Size', 'Status'], named.map((f) => h('tr', null, h('td', null, h('code', null, f.name)), h('td', null, f.type), h('td', null, fmtBytes(f.size)),
          h('td', null, f.status === 'overwritten' ? tag('partial', 'partial') : f.meta === 'deleted' ? tag('deleted – full', 'full') : tag('live', 'info'))))),
        h('p', { class: 'small muted' }, `Found ${named.length} of ${img.files.length} files. Missed: ${img.files.filter((f) => f.meta === 'lost').map((f) => f.name).join(', ')}.`));
      drawMap();
    }

    function digDeeper() {
      mode = 'deeper';
      results = gradeCarve(carve(img.img, { ...opts, types: [...opts.types] }), img.files);
      const fp = results.filter((r) => r.verdict === 'false positive').length;
      const good = results.filter((r) => r.verdict.startsWith('full')).length;
      clear(resEl,
        note('info', h('b', null, 'Dig Deeper'), ' carves the entire disk surface, independent of the file system. Files come back ', h('b', null, 'without names'), ' – Scalpel-style numbers like 00000003.jpg.'),
        h('div', { class: 'row' }, tag(`${results.length} carved`, 'info'), tag(`${good} good`, 'good'), tag(`${fp} false positives`, fp ? 'bad' : ''), h('span', { class: 'muted small' }, `(${opts.aligned ? 'sector-aligned' : 'every byte'}, ${opts.shortHeaders ? '2-byte' : 'full'} headers)`)),
        h('div', { class: 'scroll' }, table(['Carved as', 'Offset', 'Length', 'Ended by', 'Verdict', 'Really was'], results.map((r) => h('tr', { class: 'click', onclick: () => { curSector = Math.floor(r.start / SECTOR); drawMap(); drawHex(); } },
          h('td', null, h('code', null, r.name)), h('td', { class: 'mono small' }, `0x${r.start.toString(16).toUpperCase()}`), h('td', null, fmtBytes(r.length)), h('td', null, r.endedBy),
          h('td', null, tag(r.verdict, r.verdict.startsWith('full') ? 'full' : r.verdict === 'false positive' ? 'bad' : 'partial')),
          h('td', null, r.truth ? r.truth.name : '—'))))),
        fp ? note('bad', 'False positives: short signatures such as "BM" or "PK" also occur inside ordinary text and inside other files. Real carvers use longer magic numbers and sector alignment to cut these down.') : null);
      drawMap();
    }

    function rerun() {
      if (mode === 'deeper') digDeeper();
    }

    // Identify-the-signature drill
    let drill = null;
    function newDrill() {
      const s = SIGNATURES[Math.floor(Math.random() * SIGNATURES.length)];
      drill = s;
      clear(idEl, h('p', null, 'Which file type starts with ', h('code', { style: { fontSize: '1.2em' } }, hexBytes(s.short)), ' ?'),
        h('div', { class: 'row' }, SIGNATURES.map((x) => btn(x.type, (e) => {
          const ok = x.type === drill.type;
          e.target.classList.add(ok ? 'primary' : 'warn');
          if (ok) idEl.append(note('good', `Yes – ${x.type}. Full magic: ${hexBytes(x.header)}${x.footer ? `, footer ${hexBytes(x.footer)}` : ''}.`), btn('Next', newDrill, 'sm'));
        }, 'sm'))));
    }

    const chk = (label, key, onchange) => h('label', { class: 'small' }, h('input', { type: 'checkbox', checked: opts[key], onchange: (e) => { opts[key] = e.target.checked; onchange?.(); rerun(); drawHex(); } }), ' ', label);

    main.append(header(this),
      panel('Raw image /dev/sdb1 – 64 sectors × 512 bytes (click a sector)', mapEl,
        h('div', { class: 'legend' }, Object.entries(TYPE_COLOR).map(([t, c]) => h('span', null, h('i', { style: { background: c } }), t)),
          h('span', null, h('i', { style: { background: 'var(--violet-soft)' } }), 'text'), h('span', null, h('i', { style: { background: 'var(--cell-free)' } }), 'unallocated'), h('span', null, h('i', { style: { background: 'var(--panel)', border: '1px solid var(--line)' } }), 'zeroed')),
        h('p', { class: 'small muted' }, 'Colours show the ground truth (what a tool cannot see). Sectors 40–44 hold a fragmented JPEG with a foreign sector in the middle; sector 47 starts a PDF whose end was overwritten.')),
      h('div', { class: 'grid2' },
        panel('Recovery',
          h('div', { class: 'row' }, btn('Dig Deep (file system)', digDeep, 'primary'), btn('Dig Deeper (carve)', digDeeper, 'gold')),
          h('div', { class: 'row' }, chk('Only check headers at sector starts', 'aligned'), chk('Use 2-byte slide headers', 'shortHeaders')),
          h('div', { class: 'row small' }, 'Types: ', SIGNATURES.map((s) => h('label', null, h('input', { type: 'checkbox', checked: true, onchange: (e) => { e.target.checked ? opts.types.add(s.type) : opts.types.delete(s.type); rerun(); } }), ` ${s.ext} `))),
          resEl),
        panel('Hex view', hexEl)),
      h('div', { class: 'grid2' },
        panel('Signature table', table(['Type', 'Slide header', 'Full magic', 'End'], signatureTable().map((r) => h('tr', null, h('td', null, r.type), h('td', null, h('code', null, r.short)), h('td', { class: 'mono small' }, r.header), h('td', { class: 'mono small' }, r.footer))))),
        panel('Name that header', idEl)));
    drawMap();
    drawHex();
    digDeeper();
    newDrill();
  },
};
