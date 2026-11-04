import { h, clear, panel, header, btn, field, select, note, statusTag, color, legend, logBox, table, tag } from './ui.js';
import { ExtVolume, FIRST_USER_INODE } from '../core/ext.js';
import { fmtBytes } from '../core/util.js';
import { tokenize } from '../core/grep.js';

export default {
  id: 'ext', icon: '🐧', group: 'Linux & Mac', title: 'Ext Inodes, Links & Journal', slides: 'Ext File System · Inodes and Links · extundelete',
  blurb: 'Make hard and soft links, watch link counts hit 0, and recover from the journal with extundelete.',
  lead: 'An <strong>inode</strong> holds everything about a file <em>except its name and data</em>. Names live in directory entries; a <strong>hard link</strong> is another name for the same inode, a <strong>symbolic link</strong> is a separate inode storing a path. When the link count hits <strong>0</strong> the file is deleted.',
  mount(main) {
    let vol;
    let last = null; // extundelete results
    const log = logBox();
    const cmdIn = h('input', { size: 40, placeholder: 'e.g.  write notes.txt 9000   |   ln notes.txt n2   |   rm notes.txt', spellcheck: false });
    const bsSel = select([[1024, '1,024'], [2048, '2,048'], [4096, '4,096']], 4096, () => reset());
    const sbEl = h('div');
    const dirEl = h('div');
    const inoEl = h('div', { class: 'scroll' });
    const blkEl = h('div', { class: 'diskmap' });
    const imapEl = h('div', { class: 'diskmap' });
    const jEl = h('div');
    const undelEl = h('div');

    function reset() {
      vol = new ExtVolume({ blockSize: Number(bsSel.value) });
      last = null;
      log.add(`mkfs.ext4: ${vol.nBlocks} blocks of ${fmtBytes(vol.blockSize)}, ${vol.nInodes} inodes, journal holds the last ${vol.journalSize} metadata updates.`);
      for (const c of ['write evidence.txt 9000', 'write diary.log 5000', 'ln evidence.txt backup_copy', 'ln -s diary.log shortcut']) run(c, true);
      draw();
    }

    function run(line, quiet = false) {
      let w;
      try {
        w = tokenize(line.trim());
      } catch (e) {
        log.add('✗ ' + e.message);
        return;
      }
      const [c, ...a] = w;
      try {
        if (c === 'write' || c === 'touch') {
          const size = c === 'touch' ? 0 : Number(a[1] ?? 4096);
          const r = vol.write(a[0], size);
          if (!quiet) log.add(`$ ${line}\n→ inode ${r.inode.ino}, blocks [${r.inode.blocks.join(', ')}]${r.reusedInode ? ` ⚠ reused inode of a deleted file` : ''}${r.overwrote.length ? ` ⚠ overwrote freed blocks of ${r.overwrote.join(', ')}` : ''}`);
        } else if (c === 'ln' && a[0] === '-s') {
          const i = vol.symlink(a[1], a[2]);
          if (!quiet) log.add(`$ ${line}\n→ new inode ${i.ino} (symlink) storing the path "${a[1]}"`);
        } else if (c === 'ln') {
          const i = vol.link(a[0], a[1]);
          if (!quiet) log.add(`$ ${line}\n→ ${a[1]} now points to inode ${i.ino}; link count = ${i.links}`);
        } else if (c === 'rm') {
          const r = vol.rm(a[0]);
          log.add(`$ ${line}\n→ ${r.freed ? `link count 0 → inode ${r.inode.ino} and its blocks marked free; block pointers zeroed (data still on disk)` : `link count now ${r.inode.links} – file still exists via ${vol.namesFor(r.inode.ino).join(', ')}`}`);
        } else if (c === 'cat') {
          const i = vol.resolve(a[0]);
          log.add(`$ ${line}\n→ reads inode ${i.ino}: ${fmtBytes(i.size)} in blocks [${i.blocks.join(', ')}]`);
        } else if (c === 'extundelete') {
          undelete();
        } else if (c === 'ls' || c === 'help') {
          log.add('Commands: write NAME BYTES · touch NAME · ln TARGET NAME · ln -s TARGET NAME · rm NAME · cat NAME · extundelete');
        } else {
          throw new Error(`${c}: unknown command (try help)`);
        }
      } catch (e) {
        log.add(`$ ${line}\n✗ ${e.message}`);
      }
      if (!quiet) draw();
    }

    function undelete() {
      last = vol.extundelete();
      log.add(`$ extundelete /dev/sda4 --restore-all → ${last.filter((r) => r.status !== 'none').length} of ${last.length} deleted files restored to RECOVERED_FILES/`);
      draw();
    }

    function draw() {
      const sb = vol.superblock;
      clear(sbEl, h('div', { class: 'row small' },
        tag(`block size ${fmtBytes(sb.blockSize)}`, 'info'), tag(`${sb.blocksCount} blocks · ${sb.freeBlocks} free`), tag(`${sb.inodesCount} inodes · ${sb.freeInodes} free`), tag(sb.journal, 'warn'), tag('real groups: up to 32,768 blocks')));
      clear(dirEl, table(['Name', 'Inode', 'Kind'], [...vol.dir].map(([n, ino]) => {
        const i = vol.inodes[ino];
        return h('tr', null, h('td', null, h('code', null, n)), h('td', { class: 'mono' }, ino),
          h('td', null, i.type === 'symlink' ? h('span', null, tag('symlink', 'info'), ` → ${i.target} `, vol.dir.has(i.target) ? null : tag('dangling', 'bad'))
            : i.type === 'dir' ? tag('dir') : i.links > 1 ? tag(`hard link (${i.links} names)`, 'warn') : tag('file')));
      })));
      const inodes = vol.inodes.slice(1).filter(Boolean).filter((i) => i.ino >= FIRST_USER_INODE || i.reserved);
      clear(inoEl, table(['Inode', 'Type', 'Links', 'Size', 'Block pointers', 'dtime'], inodes.map((i) => h('tr', { class: i.dtime ? 'dead' : '' },
        h('td', { class: 'mono' }, h('i', { style: { display: i.fileId ? 'inline-block' : 'none', width: '10px', height: '10px', borderRadius: '3px', background: color(i.fileId), marginRight: '6px' } }), i.ino),
        h('td', null, i.reserved ?? i.type),
        h('td', null, tag(String(i.links), i.links === 0 ? 'bad' : i.links > 1 ? 'warn' : '')),
        h('td', null, i.type === 'symlink' ? `${i.size} (path)` : fmtBytes(i.size)),
        h('td', { class: 'mono small' }, i.type === 'symlink' ? `"${i.target}" (fast symlink)` : i.dtime ? `[zeroed – had ${i.zeroed}]` : `[${i.blocks.join(', ')}]`),
        h('td', null, i.dtime ? tag('deleted', 'bad') : '')))));
      const marks = new Map();
      for (const r of last ?? []) for (const b of r.blocks ?? []) marks.set(b.block, b.ok);
      clear(blkEl, Array.from(vol.blockBitmap, (bit, b) => {
        const d = vol.blockData[b];
        let cls = 'cell';
        let style = {};
        if (d?.system) cls += ' sys';
        else if (d) {
          style = { background: color(d.fileId) };
          if (!bit) cls += ' ghost';
        }
        if (marks.has(b)) cls += ` hl ${marks.get(b) ? 'ok-mark' : 'x-mark'}`;
        return h('div', { class: cls, style, title: `Block ${b}  bitmap=${bit}\n${d?.system ?? (d ? `data of ${d.name} (part ${d.part + 1})` : 'empty')}` },
          h('span', { class: 'no' }, `#${b}`), h('span', { class: 'lbl' }, d?.system ? d.system.split(' ')[0].slice(0, 6) : d?.name.slice(0, 6) ?? ''), h('span', { class: 'no' }, `bit ${bit}`));
      }));
      clear(imapEl, Array.from(vol.inodeBitmap.slice(1), (bit, k) => {
        const ino = k + 1;
        const i = vol.inodes[ino];
        return h('div', { class: `cell ${ino < FIRST_USER_INODE ? 'sys' : ''} ${i?.dtime && !bit ? 'ghost' : ''}`, style: i?.fileId ? { background: color(i.fileId) } : {}, title: `Inode ${ino} bitmap=${bit}` },
          h('span', { class: 'no' }, `i${ino}`), h('span', { class: 'lbl' }, ino === 2 ? '/' : ino === 11 ? 'l+f' : ''), h('span', { class: 'no' }, `bit ${bit}`));
      }));
      clear(jEl, h('ol', { class: 'small mono', style: { margin: 0, paddingLeft: '22px' } },
        vol.journal.map((j) => h('li', null, `#${j.seq} ${j.kind.padEnd(7)} ${j.name} → inode ${j.copy.ino} [${(j.copy.blocks ?? []).join(',')}]`))),
        h('p', { class: 'small muted' }, `Only the newest ${vol.journalSize} updates fit; older copies are overwritten as the journal wraps.`));
      clear(undelEl, last ? table(['File', 'Inode', 'Result', 'Why'], last.map((r) => h('tr', null,
        h('td', null, h('code', null, r.out ?? r.name)), h('td', { class: 'mono' }, r.ino),
        h('td', null, r.status === 'none' ? tag('not recoverable', 'bad') : statusTag(r.status)), h('td', { class: 'small' }, r.why)))) : h('p', { class: 'muted' }, 'Delete something, then run extundelete.'));
    }

    cmdIn.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && cmdIn.value.trim()) {
        run(cmdIn.value);
        cmdIn.value = '';
      }
    });
    const quick = (c) => btn(c, () => run(c), 'sm');

    main.append(header(this),
      panel('Shell',
        h('div', { class: 'row' }, field('Command', cmdIn), btn('Run', () => { run(cmdIn.value); cmdIn.value = ''; }, 'primary'), field('Block size (bytes)', bsSel), btn('mkfs (reset)', reset)),
        h('div', { class: 'row' }, h('span', { class: 'muted small' }, 'Try:'), quick('rm evidence.txt'), quick('rm backup_copy'), quick('rm diary.log'), quick('cat shortcut'), quick('write big.iso 30000'), quick('extundelete')),
        h('ol', { class: 'steps small muted' },
          h('li', null, h('code', null, 'rm evidence.txt'), ' – the link count drops to 1; the file is still there under ', h('code', null, 'backup_copy'), '.'),
          h('li', null, h('code', null, 'rm diary.log'), ', then ', h('code', null, 'cat shortcut'), ' – a symbolic link is just a path; now it dangles.'),
          h('li', null, 'Delete ', h('code', null, 'backup_copy'), ' too. Notice ext4 zeroes the block pointers – so ', h('code', null, 'extundelete'), ' reads the journal.'),
          h('li', null, 'Write several new files until the journal wraps or the blocks are reused, then run extundelete again.')),
        log),
      panel('Superblock', sbEl),
      h('div', { class: 'grid2' }, panel('Directory entries (name → inode)', dirEl), panel('Inode table', inoEl)),
      panel('Block bitmap & data blocks', blkEl, legend([['var(--accent)', 'allocated'], ['var(--accent)', 'freed – data still there', { opacity: 0.5, border: '1px dashed var(--muted)' }], ['var(--cell-free)', 'empty']])),
      h('div', { class: 'grid2' }, panel('Inode bitmap', imapEl), panel('Journal (newest last)', jEl)),
      panel('extundelete results', undelEl, note('info', 'extundelete only works on unmounted (or read-only) Ext3/Ext4 volumes – in real life, image first and work on the copy.')));
    reset();
  },
};
