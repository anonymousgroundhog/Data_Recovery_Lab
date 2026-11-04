import { h, clear, panel, header, btn, note, table, tag } from './ui.js';
import { CORRUPTIONS, LOGICAL_FILES, consistencyCheck, zeroKnowledge } from '../core/triage.js';

export default {
  id: 'logical', icon: '🧩', group: 'Carving & Damage', title: 'Logical Damage Repair', slides: 'Logical Damage · Logical Recovery Techniques',
  blurb: 'Same corrupted volume, two strategies: chkdsk-style consistency checking vs. zero-knowledge analysis.',
  lead: 'Logical damage is more common than physical: power outages, shutting down mid-boot, RAID/driver bugs, crashes. Symptoms include crashes, data loss, <strong>recursive directories</strong> and <strong>negative free space</strong>.',
  mount(main) {
    const journal = h('input', { type: 'checkbox', checked: true });
    const out = h('div');
    const bar = h('div', { class: 'bar' }, h('span', { style: { width: '0%' } }));
    let timer = null;

    function run(kind) {
      clearInterval(timer);
      const res = kind === 'chk' ? consistencyCheck({ journaling: journal.checked }) : zeroKnowledge();
      // Animate: 1 simulated minute ≈ 40 ms, so the speed difference is visible.
      const total = res.minutes * 40;
      let t = 0;
      clear(out, h('div', { class: 'row' }, h('b', null, kind === 'chk' ? 'chkdsk /f  (consistency check)' : 'Zero-knowledge scan'), tag(`${res.minutes} min (simulated)`, 'info')), bar);
      timer = setInterval(() => {
        t += 40;
        bar.firstChild.style.width = `${Math.min(100, (t / total) * 100)}%`;
        if (t >= total) {
          clearInterval(timer);
          show(kind, res);
        }
      }, 40);
    }

    function show(kind, res) {
      const lost = res.files.filter((f) => f.ok === false).length;
      out.append(
        h('ul', { class: 'small' }, res.log.map((l) => h('li', null, l))),
        table(['File', 'Was in', 'Result', ''], res.files.map((f) => h('tr', null, h('td', null, h('code', null, f.name)), h('td', null, f.dir ?? '—'), h('td', { class: 'mono small' }, f.result),
          h('td', null, tag(f.note, f.ok === true ? 'good' : f.ok === 'meh' ? 'warn' : 'bad'))))),
        kind === 'chk'
          ? note(lost ? 'bad' : 'good', h('b', null, 'Fast and repairs in place – '), `but ${lost} file(s) were deleted and orphans lost their names (FOUND.000\\*.CHK). On evidence, run it only on a copy.`)
          : note('good', h('b', null, 'Much slower, recovers everything – '), 'but it repairs nothing: the data is extracted to another drive and the damaged volume is left as is.'));
    }

    main.append(header(this),
      h('div', { class: 'grid2' },
        panel('The damaged volume',
          h('ul', null, CORRUPTIONS.map((c) => h('li', null, c.text))),
          h('h3', null, 'Files on it'),
          h('ul', { class: 'small' }, LOGICAL_FILES.map((f) => h('li', null, h('code', null, f.name), f.dir ? ` in ${f.dir}` : ''))),
          h('label', { class: 'small' }, journal, ' Journaling file system (NTFS 5.0 / Ext3) – can roll back to a stable state')),
        panel('Choose a technique',
          h('div', { class: 'row' }, btn('Consistency check (chkdsk / fsck)', () => run('chk'), 'primary'), btn('Zero-knowledge analysis', () => run('zk'), 'gold')),
          out)),
      panel('Compare',
        table(['', 'Consistency checking', 'Zero-knowledge analysis'], [
          ['How', 'Verify structures against the spec (e.g. every directory has . and ..)', 'Rebuild the file system from scratch using known structures'],
          ['Speed', 'Fast', 'Much slower'],
          ['Weakness', 'Fails if badly damaged; chkdsk may delete files', 'Doesn\'t repair – extracts data elsewhere'],
          ['Tools', 'chkdsk (Windows), fsck (Linux), Disk Utility (Mac)', 'Scan for structures & file boundaries; TestDisk, Sleuth Kit'],
        ].map(([a, b, c]) => h('tr', null, h('td', null, h('b', null, a)), h('td', null, b), h('td', null, c))))));
  },
};
