import { h, clear, panel, header, btn, field, select, note, statusTag, color, legend, logBox, table, tag, modal } from './ui.js';
import { NtfsVolume, dataRuns, FIRST_USER_RECORD, RESIDENT_LIMIT } from '../core/ntfs.js';
import { fmtBytes } from '../core/util.js';
import { iFileView } from './ifileview.js';

export default {
  id: 'ntfs', icon: '🗂️', group: 'Windows', title: 'NTFS & the Recycle Bin', slides: 'NTFS · Deleting on NTFS · Recycle Bin – Windows 7 → 10',
  blurb: 'Send files to $Recycle.Bin, inspect the $I/$R pair, empty the bin and recover from the MFT.',
  lead: 'NTFS keeps one <strong>MFT record</strong> per file (name, times, SID, and the exact <em>data runs</em>) plus a <strong>cluster bitmap</strong>. Delete → the file is renamed into <code>$Recycle.Bin\\%SID%</code>; empty the bin → the record is marked unused and its bitmap bits cleared. The bytes stay.',
  mount(main) {
    let vol;
    let sel = null;
    let recResult = null;
    const log = logBox();
    const userSel = select(['alice', 'bob'], 'alice', () => draw());
    const nameIn = h('input', { value: 'payroll.xlsx', size: 14 });
    const sizeIn = h('input', { type: 'number', min: 1, value: 14000 });
    const explorerEl = h('div');
    const binEl = h('div');
    const mftEl = h('div', { class: 'scroll' });
    const mapEl = h('div', { class: 'diskmap' });
    const detailEl = h('div');

    function reset() {
      vol = new NtfsVolume();
      sel = null;
      recResult = null;
      vol.create('budget.xlsx', 9000, 'alice');
      vol.create('notes.txt', 400, 'alice');
      vol.create('vacation.jpg', 21000, 'bob', 'C:\\Users\\bob\\Pictures');
      vol.create('plans.docx', 13000, 'alice');
      log.add('New NTFS volume. MFT records 0–11 are system files ($MFT, $Bitmap…); user files start at record 16.');
      draw();
    }

    function act(fn) {
      try {
        fn();
      } catch (e) {
        log.add('✗ ' + e.message);
      }
      draw();
    }

    function draw() {
      const user = userSel.value;
      const live = vol.mft.filter((r) => r.inUse && !r.system && !r.inBin && !r.isIFile);
      clear(explorerEl, live.length ? table(['File', 'Owner', 'Size', ''], live.map((r) => h('tr', null,
        h('td', null, h('code', null, vol.path(r))),
        h('td', null, r.owner),
        h('td', null, fmtBytes(r.size)),
        h('td', { style: { whiteSpace: 'nowrap' } },
          btn('Delete', () => act(() => { const { r: rr, iRec } = vol.recycle(r.rec); log.add(`${r.owner} deleted ${rr.original} → ${rr.name} + ${iRec.name} in $Recycle.Bin\\${rr.sid.slice(-4)}…`); }), 'sm'),
          ' ',
          btn('Shift+Del', () => act(() => { vol.purge(r.rec); log.add(`Shift+Delete ${r.name}: skipped the Recycle Bin. MFT record ${r.rec} marked unused, bitmap cleared – data still on disk.`); }), 'sm warn'))))) : h('p', { class: 'muted' }, 'No live user files.'));

      const bin = vol.bin(user);
      clear(binEl,
        h('div', { class: 'mono small muted' }, `${vol.binDir(user)}\\`),
        bin.length ? table(['$R (data)', '$I (metadata)', 'Original location', ''], bin.map((r) => h('tr', null,
          h('td', null, h('code', null, r.name)),
          h('td', null, h('a', { href: '#', onclick: (e) => { e.preventDefault(); showI(vol.record(r.partner)); } }, vol.record(r.partner).name)),
          h('td', { class: 'small' }, r.original),
          h('td', null, btn('Restore', () => act(() => { vol.restore(r.rec); log.add(`Restored ${r.name} → ${vol.path(r)}`); }), 'sm'))))) : h('p', { class: 'muted' }, `${user}'s Recycle Bin is empty.`),
        h('div', { class: 'row' }, btn(`Empty ${user}'s Recycle Bin`, () => act(() => { const f = vol.emptyBin(user); log.add(`Emptied ${user}'s bin: ${f.length} MFT records marked unused (${f.map((x) => x.name).join(', ') || 'none'}). Clusters marked available.`); }), 'warn')),
        h('p', { class: 'small muted' }, 'Each user has a separate folder named after their SID – that is how an examiner ties a deletion to a person.'));

      const recs = vol.mft.filter((r) => r.rec >= FIRST_USER_RECORD || r.rec < 4);
      clear(mftEl, table(['#', 'Flags', 'Name', 'Directory', 'Size', 'Data runs', ''], recs.map((r) => {
        const runs = r.resident ? 'resident (in record)' : r.runs.length ? dataRuns(r.runs).map((x) => `${x.start}+${x.length}`).join(', ') : '—';
        return h('tr', { class: `click ${!r.inUse ? 'dead' : ''} ${sel === r.rec ? 'sel' : ''}`, onclick: () => { sel = r.rec; recResult = null; draw(); } },
          h('td', { class: 'mono' }, r.rec),
          h('td', null, r.system ? tag('system') : r.inUse ? tag('in use', 'good') : tag('deleted', 'bad')),
          h('td', null, r.fileId ? h('i', { style: { display: 'inline-block', width: '10px', height: '10px', borderRadius: '3px', background: color(r.fileId), marginRight: '6px' } }) : null, h('code', null, r.name)),
          h('td', { class: 'small' }, r.dir ?? ''),
          h('td', null, r.size ? fmtBytes(r.size) : ''),
          h('td', { class: 'mono small' }, runs),
          h('td', null, !r.inUse && !r.system && r.fileId ? btn('Recover', (e) => { e.stopPropagation(); sel = r.rec; recResult = vol.recover(r.rec); log.add(`Recover MFT #${r.rec} ${r.name}: ${recResult.status}`); draw(); }, 'sm primary') : null));
      })));

      const marks = new Map(recResult?.clusters.map((c) => [c.cluster, c.ok]) ?? []);
      const selRec = sel != null ? vol.mft[sel] : null;
      clear(mapEl, Array.from(vol.bitmap, (bit, c) => {
        const d = vol.data[c];
        let cls = 'cell';
        let style = {};
        if (d?.system) cls += ' sys';
        else if (d) {
          style = { background: color(d.fileId) };
          if (!bit) cls += ' ghost';
        }
        if (selRec?.runs?.includes(c)) cls += ' hl';
        if (marks.has(c)) cls += marks.get(c) ? ' ok-mark' : ' x-mark';
        return h('div', { class: cls, style, title: `Cluster ${c}\nBitmap bit: ${bit}${d?.name ? `\nHolds data of: ${d.name} (part ${d.part + 1})` : ''}` },
          h('span', { class: 'no' }, `#${c}`), h('span', { class: 'lbl' }, d?.name?.slice(0, 6) ?? (d?.system ? '$MFT' : '')), h('span', { class: 'no' }, `bit ${bit}`));
      }));

      clear(detailEl, selRec ? recordDetail(selRec) : h('p', { class: 'muted' }, 'Click an MFT row to see its record. Click a $I name to open it in the hex viewer.'));
    }

    function recordDetail(r) {
      return h('div', null,
        h('div', { class: 'row' }, h('b', null, `MFT record ${r.rec}: ${r.name}`), r.inUse ? tag('in use', 'good') : tag('deleted', 'bad'), r.seq ? tag(`sequence ${r.seq}`, 'info') : null),
        r.system ? h('p', null, 'System metadata file.') : h('ul', { class: 'small' },
          h('li', null, 'Path: ', h('code', null, vol.path(r))),
          r.original ? h('li', null, 'Original path: ', h('code', null, r.original)) : null,
          h('li', null, `Owner SID: ${r.sid}`),
          h('li', null, `Created ${r.created?.toISOString().slice(0, 16).replace('T', ' ')} UTC${r.deletedAt ? ` · record freed ${r.deletedAt.toISOString().slice(0, 16).replace('T', ' ')} UTC` : ''}`),
          h('li', null, r.resident ? `Resident: ≤ ${RESIDENT_LIMIT} bytes, so the content lives inside the MFT record – no clusters.` : `Data runs: ${dataRuns(r.runs).map((x) => `start ${x.start}, length ${x.length}`).join(' | ')}`)),
        r.isIFile && r.content ? btn('Open $I in hex viewer', () => showI(r), 'sm') : null,
        recResult && recResult.record === r ? h('div', null,
          h('div', { class: 'row' }, h('b', null, 'Recovery result:'), statusTag(recResult.status)),
          recResult.resident ? note('good', 'Resident data is inside the record itself – recovered as long as the record has not been reused.')
            : table(['Cluster', 'Result'], recResult.clusters.map((c) => h('tr', null, h('td', { class: 'mono' }, c.cluster), h('td', null, tag((c.ok ? '✓ ' : '✗ ') + c.why, c.ok ? 'good' : 'bad'))))),
          recResult.status === 'full' && dataRuns(r.runs).length > 1 ? note('good', 'Fragmented, yet fully recovered: the MFT kept the exact data runs (unlike FAT, where the chain is zeroed).') : null) : null);
    }

    function showI(r) {
      modal(h('h2', null, `${r.name}  (${r.content.length} bytes)`), h('p', { class: 'small muted' }, `${r.dir}\\${r.name}`), iFileView(r.content), h('div', { class: 'row', style: { marginTop: '10px' } }, btn('Close', (e) => e.target.closest('.modal-bg').remove())));
    }

    main.append(header(this),
      panel('Workstation',
        h('div', { class: 'row' }, field('Logged-in user', userSel), field('File name', nameIn), field('Size (bytes)', sizeIn),
          btn('Save file', () => act(() => { const { record, reusedRecord, overwrote } = vol.create(nameIn.value, Number(sizeIn.value), userSel.value); log.add(`${userSel.value} saved ${record.name} → MFT #${record.rec}${record.resident ? ' (resident)' : `, clusters ${dataRuns(record.runs).map((x) => `${x.start}+${x.length}`).join(', ')}`}.${reusedRecord ? ` ⚠ Reused the record of deleted ${reusedRecord.name} – its metadata is gone!` : ''}${overwrote.length ? ` ⚠ Overwrote clusters of ${overwrote.join(', ')}.` : ''}`); }), 'primary'),
          btn('Reset volume', reset)),
        h('ol', { class: 'steps small muted' },
          h('li', null, 'As alice, Delete ', h('code', null, 'plans.docx'), '. Open its ', h('code', null, '$I'), ' file – find the size, deletion time and original path.'),
          h('li', null, 'Empty alice\'s bin, then Recover the deleted MFT record. It comes back whole – even though nothing was "in the bin".'),
          h('li', null, 'Delete and empty ', h('code', null, 'budget.xlsx'), ', save a big new file, then try to Recover. What happened to the record and the clusters?'),
          h('li', null, 'Switch to bob – his Recycle Bin is a different SID folder.'))),
      h('div', { class: 'grid2' }, panel('File Explorer', explorerEl), panel('Recycle Bin', binEl)),
      panel('Master File Table ($MFT)', mftEl),
      h('div', { class: 'grid2' },
        panel('Cluster bitmap', mapEl, legend([['var(--accent)', 'bit 1 – allocated'], ['var(--accent)', 'bit 0 but old data still there', { opacity: 0.5, border: '1px dashed var(--muted)' }], ['var(--cell-free)', 'bit 0 – empty']])),
        panel('Record details', detailEl)),
      panel('Activity log', log));
    reset();
  },
};
