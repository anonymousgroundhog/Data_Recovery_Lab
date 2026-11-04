import { h, clear, panel, header, btn, field, select, note, statusTag, color, legend, logBox, table, tag } from './ui.js';
import { FatVolume, demoFat, fatLabel, FREE, BAD, RES, DELETED_MARK } from '../core/fat.js';
import { fmtBytes } from '../core/util.js';

export default {
  id: 'fat', icon: '📇', group: 'Windows', title: 'FAT Undelete', slides: 'FAT16 / FAT32 · Deleting on FAT · DiskDigger result colors',
  blurb: 'Delete files, watch the FAT chain disappear while the data stays, then try to undelete before it is overwritten.',
  lead: 'Each <strong>FAT entry</strong> holds the next cluster, <code>EOC</code>, <code>BAD</code>, <code>RES</code> or <em>free</em>. Deleting only changes the first letter of the name to <code>0xE5</code> (shown as <code>σ</code>) and zeroes the chain – <strong>the data clusters are not touched</strong>.',
  mount(main) {
    let vol;
    let preview = null; // undelete result being shown
    const log = logBox();
    const mapEl = h('div', { class: 'diskmap' });
    const dirEl = h('div', { class: 'scroll' });
    const resEl = h('div');
    const nameIn = h('input', { value: 'REPORT.DOC', size: 12 });
    const sizeIn = h('input', { type: 'number', min: 1, value: 10000 });
    const strat = select([['first', 'First free cluster'], ['next', 'Next free (keeps moving forward)']], 'first', (e) => { vol.strategy = e.target.value; log.add(`Allocation strategy → ${e.target.selectedOptions[0].text}`); });

    function reset(demo) {
      preview = null;
      if (demo) {
        vol = demoFat().v;
        log.add('Loaded demo: BUDGET, MEMO, PHOTO, NOTES created; MEMO deleted; LEDGER.DB created – it filled MEMO\'s gap and continued after NOTES (fragmented).');
      } else {
        vol = new FatVolume();
        log.add('Formatted a new 40-cluster FAT volume (clusters 0–1 reserved, 27 bad).');
      }
      vol.strategy = strat.value;
      draw();
    }

    function draw() {
      const marks = new Map(preview?.clusters.filter((c) => c.cluster != null).map((c) => [c.cluster, c.ok]) ?? []);
      clear(mapEl, vol.fat.map((v, c) => {
        const d = vol.data[c];
        const e = d ? vol.entry(d.fileId) : null;
        let cls = 'cell';
        let style = {};
        let lbl = '';
        if (v === RES) cls += ' sys';
        else if (v === BAD) cls += ' bad';
        else if (d) {
          style = { background: color(d.fileId) };
          lbl = e.name.split('.')[0].slice(0, 6);
          if (v === FREE) cls += ' ghost';
        }
        if (marks.has(c)) cls += ` hl ${marks.get(c) ? 'ok-mark' : 'x-mark'}`;
        const title = `Cluster ${c}\nFAT entry: ${fatLabel(v)}${d ? `\nPhysically holds: ${e.name} part ${d.part + 1}${v === FREE ? ' (deleted – still readable!)' : ''}` : ''}`;
        return h('div', { class: cls, style, title }, h('span', { class: 'no' }, `#${c}`), h('span', { class: 'lbl' }, lbl), h('span', { class: 'no' }, `→${fatLabel(v)}`));
      }));
      const rows = vol.dir.map((e) => {
        const chain = e.deleted ? null : vol.chainOf(e);
        return h('tr', { class: `${e.deleted ? 'dead' : ''} ${preview?.entry === e ? 'sel' : ''}` },
          h('td', null, h('i', { style: { display: 'inline-block', width: '10px', height: '10px', borderRadius: '3px', background: color(e.id), marginRight: '6px' } }), h('code', null, vol.displayName(e))),
          h('td', { style: { whiteSpace: 'nowrap' } }, fmtBytes(e.size)),
          h('td', null, e.firstCluster),
          h('td', { class: 'mono small' }, chain ? chain.join('→') + '→EOC' : '(zeroed)'),
          h('td', null, e.deleted ? tag('deleted', 'bad') : tag('live', 'good')),
          h('td', null, e.deleted
            ? btn('Undelete…', () => { preview = vol.undelete(e.id); log.add(`Undelete ${e.name}: ${preview.good}/${preview.need} clusters good (${preview.status}).`); draw(); }, 'sm primary')
            : btn('Delete', () => { const ch = vol.remove(e.id); preview = null; log.add(`Deleted ${e.name}: name → ${vol.displayName(e)}, FAT entries ${ch.join(', ')} → free. Data untouched.`); draw(); }, 'sm warn')));
      });
      clear(dirEl, table(['Name (dir entry)', 'Size', '1st cluster', 'FAT chain', 'State', ''], rows));
      clear(resEl, preview ? showPreview(preview) : h('p', { class: 'muted' }, 'Pick a deleted file and press Undelete… to see what a recovery tool would get.'));
    }

    function showPreview(p) {
      const e = p.entry;
      return h('div', null,
        h('div', { class: 'row' }, h('b', null, e.name), statusTag(p.status), h('span', { class: 'muted small' }, `${p.good} of ${p.need} clusters`)),
        h('p', { class: 'small' }, `The tool reads the directory entry: first cluster ${e.firstCluster}, size ${fmtBytes(e.size)} → ${p.need} clusters. The chain is gone, so it `,
          h('b', null, 'assumes the file was contiguous'), ' and takes the next free clusters:'),
        table(['Cluster', 'Result'], p.clusters.map((c) => h('tr', null, h('td', { class: 'mono' }, c.cluster ?? '—'), h('td', null, c.ok ? tag('✓ ' + c.why, 'good') : tag('✗ ' + c.why, 'bad'))))),
        p.status !== 'full' && p.clusters.some((c) => c.why.startsWith('wrong') || c.why.startsWith('holds'))
          ? note('bad', 'This file was fragmented (or its neighbours were deleted). Without the FAT chain the tool grabbed the wrong clusters – NTFS keeps exact data runs in the MFT, so it does better here.')
          : null,
        p.status === 'full' ? note('good', 'All clusters intact – recover it to a different drive so you do not overwrite other deleted data.') : null);
    }

    main.append(header(this),
      panel('Build the volume',
        h('div', { class: 'row' },
          field('File name', nameIn), field('Size (bytes)', sizeIn), field('Allocation', strat),
          btn('Save file', () => {
            try {
              const r = vol.create(nameIn.value.toUpperCase(), Number(sizeIn.value));
              preview = null;
              log.add(`Saved ${r.entry.name} in clusters ${r.chain.join(', ')}${r.fragmented ? ' (FRAGMENTED)' : ''}.${r.overwrote.length ? ` ⚠ Overwrote deleted data of ${r.overwrote.join(', ')}!` : ''}`);
              nameIn.value = `FILE${vol.nextId}.DAT`;
              draw();
            } catch (err) {
              log.add('✗ ' + err.message);
            }
          }, 'primary'),
          btn('Load demo scenario', () => reset(true)), btn('Format (reset)', () => reset(false))),
        h('ol', { class: 'steps small muted' },
          h('li', null, 'Load the demo. Delete ', h('code', null, 'PHOTO.JPG'), ' and undelete it – everything is still there (green).'),
          h('li', null, 'Delete ', h('code', null, 'LEDGER.DB'), ' (fragmented) and undelete it. Why does the tool get the wrong data?'),
          h('li', null, 'Save a new 12,000-byte file, then undelete again. Watch the log say which deleted file you overwrote.'),
          h('li', null, 'Switch allocation to "Next free" – how does that change the odds of recovery?'))),
      panel('Disk – clusters with their FAT entries', mapEl,
        legend([['var(--accent)', 'allocated file data'], ['var(--accent)', 'deleted but still on disk', { opacity: 0.5, border: '1px dashed var(--muted)' }], ['var(--cell-free)', 'free / empty'], ['var(--red-soft)', 'BAD'], ['var(--line)', 'RES (reserved)']])),
      panel('Root directory', dirEl, h('p', { class: 'muted small' }, `Deleted names start with ${DELETED_MARK} (byte 0xE5). The size and first cluster survive.`)),
      panel('Undelete preview (DiskDigger colours: green / white / red)', resEl),
      panel('Activity log', log));
    reset(true);
  },
};
