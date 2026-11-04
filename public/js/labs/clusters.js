import { h, clear, panel, header, field, select, note } from './ui.js';
import { allocate, sectorMap } from '../core/allocation.js';

const B = (n) => `${n.toLocaleString('en-US')} bytes`;

export default {
  id: 'clusters', icon: '🧱', group: 'Foundations', title: 'Sectors & Clusters', slides: 'Sectors and Clusters · Clusters Are All-or-Nothing',
  blurb: 'See how a file is rounded up to whole clusters and where slack space comes from.',
  lead: 'The drive reads and writes <strong>sectors</strong>; the file system hands out <strong>clusters</strong> (allocation units) of 1–128 sectors. A cluster counts as <em>fully used</em> if even one byte of it is used.',
  mount(main) {
    const st = { size: 42000, sector: 4096, spc: 10 };
    const out = h('div');
    const sizeIn = h('input', { type: 'number', min: 0, step: 1, value: st.size, oninput: () => { st.size = Number(sizeIn.value); draw(); } });
    const spcIn = h('input', { type: 'number', min: 1, max: 128, value: st.spc, oninput: () => { st.spc = Number(spcIn.value); draw(); } });
    const presets = [
      ['Slide example: 42,000 B, 4K sectors × 10', { size: 42000, sector: 4096, spc: 10 }],
      ['Tiny text file on a 4 KiB cluster', { size: 300, sector: 512, spc: 8 }],
      ['Exactly one cluster', { size: 4096, sector: 512, spc: 8 }],
      ['One byte over', { size: 4097, sector: 512, spc: 8 }],
    ];
    const sectorSel = select([[512, '512 bytes (traditional)'], [4096, '4,096 bytes (Advanced Format)']], st.sector, (e) => { st.sector = Number(e.target.value); draw(); });

    function draw() {
      let a;
      try {
        a = allocate(st.size, st.sector, st.spc);
      } catch (e) {
        clear(out, note('bad', e.message));
        return;
      }
      const map = sectorMap(a);
      const shown = map.slice(0, 24);
      clear(out,
        h('div', { class: 'row' },
          stat(B(a.clusterSize), 'cluster size'),
          stat(a.clusters, 'clusters allocated'),
          stat(B(a.allocated), 'space used on disk'),
          stat(B(a.slack), 'slack (wasted)'),
          stat(`${(a.efficiency * 100).toFixed(1)}%`, 'efficiency')),
        h('h3', null, 'How the file lands on disk'),
        h('div', { class: 'clusters' },
          shown.map((sectors, ci) => h('div', { class: 'cluster' },
            h('div', { class: 'cap' }, `Cluster ${ci + 1} – ${ci === a.clusters - 1 && a.slack ? 'counted as FULL by the FS' : 'full'}`),
            h('div', { class: 'sectors' }, sectors.map((s, si) => h('div', {
              class: `sector ${s.state === 'slack' ? 'slack' : ''}`,
              title: `Sector ${si + 1}: ${s.used} of ${a.sectorSize} bytes used`,
            }, h('span', { style: { height: `${(s.used / a.sectorSize) * 100}%` } }))))))),
        map.length > shown.length ? h('p', { class: 'muted small' }, `… ${map.length - shown.length} more full clusters not drawn.`) : null,
        h('div', { class: 'legend' },
          h('span', null, h('i', { style: { background: 'var(--accent)' } }), 'file data'),
          h('span', null, h('i', { style: { background: 'var(--gold-soft)', border: '1px solid var(--gold)' } }), 'drive slack – sectors never written for this file'),
          h('span', null, h('i', { style: { background: 'var(--cell-free)' } }), 'unused part of the last written sector (RAM slack)')),
        a.clusters ? note('info',
          h('b', null, 'Walk-through: '),
          `${B(a.fileSize)} ÷ ${B(a.clusterSize)} per cluster = ${(a.fileSize / a.clusterSize).toFixed(3)} → round up to `, h('b', null, `${a.clusters} cluster${a.clusters === 1 ? '' : 's'}`), '. ',
          `The last cluster holds ${B(a.lastBytes)} using ${a.lastSectorsUsed} of ${a.sectorsPerCluster} sectors, `,
          `but the file system treats the whole ${B(a.clusterSize)} as used.`) : note('info', 'A 0-byte file needs no data clusters at all.'),
        note('', h('b', null, 'Why examiners care: '), 'slack space is never handed to another file until this one is deleted, and the "drive slack" sectors can still hold fragments of whatever file used the cluster before. Old evidence hides there.'));
    }

    const stat = (v, l) => h('div', { class: 'stat' }, h('b', null, v), h('span', null, l));

    main.append(header(this),
      panel('Try it',
        h('div', { class: 'row' },
          field('File size (bytes)', sizeIn),
          field('Sector size', sectorSel),
          field('Sectors per cluster (1–128)', spcIn)),
        h('div', { class: 'row' }, h('span', { class: 'muted small' }, 'Presets:'),
          presets.map(([t, p]) => h('button', { class: 'btn sm', onclick: () => { Object.assign(st, p); sizeIn.value = p.size; spcIn.value = p.spc; sectorSel.value = p.sector; draw(); } }, t)))),
      panel(null, out));
    draw();
  },
};
