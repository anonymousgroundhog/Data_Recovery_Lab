import { h, clear, panel, header, btn, field, note, table, tag } from './ui.js';
import { buildIFile, info2Name, vistaNames, leBytes, toFiletime } from '../core/recyclebin.js';
import { parseHex, hexBytes, rng } from '../core/util.js';
import { iFileView } from './ifileview.js';

export default {
  id: 'ibin', icon: '🔎', group: 'Windows', title: '$I & INFO2 Inspector', slides: 'Recycle Bin – Windows 2000/XP · Recycle Bin – Windows 7 → 10',
  blurb: 'Build and decode $I files byte by byte, and practise XP Dc1.ext naming.',
  lead: 'A <code>$I</code> file is always <strong>544 bytes</strong>: header (0–7), original size (8–15), deletion time (16–23) and original path (24–543). Numbers are stored <em>little-endian</em> – lowest byte first.',
  mount(main) {
    const r = rng(Date.now() & 0xffff);
    const pathIn = h('input', { value: 'C:\\Users\\alice\\Documents\\Q3_report.docx', size: 46 });
    const sizeIn = h('input', { type: 'number', min: 0, value: 48213 });
    const now = new Date();
    now.setSeconds(0, 0);
    const dateIn = h('input', { type: 'datetime-local', value: new Date(now - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16) });
    const out = h('div');
    const hexIn = h('textarea', { rows: 6, placeholder: 'Paste $I bytes as hex, e.g. 01 00 00 00 00 00 00 00 55 BC 00 00 …' });
    const fileIn = h('input', { type: 'file' });
    const parseOut = h('div');
    const quizEl = h('div');
    const sampleInfo = h('div');

    // Students without Windows (or with an empty Recycle Bin) have no real $I file to open,
    // so the lab can generate realistic ones in the browser and save them to disk.
    const SAMPLE_PATHS = [
      'C:\\Users\\alice\\Documents\\Q3_report.docx',
      'C:\\Users\\bob\\Pictures\\IMG_2041.jpg',
      'D:\\Projects\\budget_2025.xlsx',
      'C:\\Users\\carol\\Desktop\\passwords.txt',
      'C:\\Users\\dave\\Downloads\\setup_v2.exe',
      'E:\\Evidence\\case-0142\\notes.pdf',
    ];

    function download(bytes, name) {
      const url = URL.createObjectURL(new Blob([bytes], { type: 'application/octet-stream' }));
      const a = h('a', { href: url, download: name });
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    function loadSample(version) {
      const path = r.pick(SAMPLE_PATHS);
      const size = r.int(512, 8 * 1024 * 1024);
      const deletedAt = new Date(Date.now() - r.int(1, 90 * 24 * 60) * 60000);
      deletedAt.setSeconds(0, 0);
      const bytes = buildIFile({ path, size, deletedAt, version });
      const name = vistaNames(path, r).i;
      hexIn.value = hexBytes(bytes);
      decode();
      clear(sampleInfo, note('info',
        `Loaded sample `, h('code', null, name), ` (version ${version}, ${bytes.length} bytes${version === 2 ? ', Windows 10+ layout' : ''}). `,
        'Try decoding the size and time by hand first, or ',
        btn('save it as a file', () => download(bytes, name), 'sm'),
        ' and open it with the file picker like a real one.'));
    }

    function build() {
      try {
        const deletedAt = new Date(dateIn.value);
        if (Number.isNaN(deletedAt.getTime())) throw new Error('Pick a deletion date/time');
        const bytes = buildIFile({ path: pathIn.value, size: Number(sizeIn.value), deletedAt });
        const names = vistaNames(pathIn.value, r);
        const sz = leBytes(Number(sizeIn.value));
        clear(out,
          h('div', { class: 'row' }, tag(`${names.i}`, 'info'), h('span', { class: 'muted small' }, 'metadata, paired with'), tag(names.r, 'info'), h('span', { class: 'muted small' }, '(the original file, renamed)')),
          iFileView(bytes),
          h('h3', null, 'Little-endian, step by step'),
          h('p', { class: 'small' }, `Size ${Number(sizeIn.value).toLocaleString('en-US')} = 0x${Number(sizeIn.value).toString(16).toUpperCase().padStart(16, '0')} → reverse the bytes → `, h('code', null, hexBytes(sz))),
          h('p', { class: 'small' }, `Time = (ms since 1970 + 11,644,473,600,000 ms) × 10,000 = ${toFiletime(deletedAt)} → `, h('code', null, hexBytes(leBytes(toFiletime(deletedAt))))),
          h('div', { class: 'row' },
            btn('Copy hex to the decoder →', () => { hexIn.value = hexBytes(bytes); clear(sampleInfo); decode(); }, 'sm'),
            btn(`Download ${names.i}`, () => download(bytes, names.i), 'sm')));
      } catch (e) {
        clear(out, note('bad', e.message));
      }
    }

    function decode() {
      try {
        const bytes = parseHex(hexIn.value);
        clear(parseOut, bytes.length !== 544 ? note('info', `${bytes.length} bytes – version-1 $I files are exactly 544; Windows 10+ writes a shorter version 2.`) : null, iFileView(bytes));
      } catch (e) {
        clear(parseOut, note('bad', e.message));
      }
    }
    fileIn.addEventListener('change', async () => {
      const f = fileIn.files[0];
      if (!f) return;
      const bytes = new Uint8Array(await f.arrayBuffer());
      clear(sampleInfo);
      hexIn.value = hexBytes(bytes);
      decode();
    });

    // INFO2 naming drill
    const xpFiles = ['C:\\Documents and Settings\\bob\\My Documents\\plan.doc', 'D:\\photos\\IMG_0042.jpg', 'C:\\Temp\\old_project', 'E:\\backup\\ledger.xls', 'C:\\Windows\\Temp\\setup.exe'];
    function drill() {
      const shuffled = r.shuffle(xpFiles);
      const rows = shuffled.map((p, idx) => {
        const answer = info2Name(p, idx + 1);
        const inp = h('input', { size: 12, placeholder: 'D?#.ext' });
        const fb = h('span');
        inp.addEventListener('input', () => {
          const ok = inp.value.trim().toLowerCase() === answer.toLowerCase();
          clear(fb, inp.value ? tag(ok ? '✓' : '…', ok ? 'good' : '') : '');
        });
        return h('tr', null, h('td', { class: 'mono' }, idx + 1), h('td', { class: 'small' }, h('code', null, p)), h('td', null, inp, ' ', fb), h('td', null, btn('show', (e) => { e.target.replaceWith(h('code', null, answer)); }, 'sm')));
      });
      clear(quizEl, table(['Deletion #', 'Original file', 'Name in RECYCLER\\%SID%\\', ''], rows));
    }

    main.append(header(this),
      h('div', null,
        panel('Build a $I file',
          h('div', { class: 'row' }, field('Original path', pathIn)),
          h('div', { class: 'row' }, field('Original size (bytes)', sizeIn), field('Deleted at (local time)', dateIn), btn('Build', build, 'primary')),
          out),
        panel('Decode a $I file',
          h('p', { class: 'small muted' }, 'Paste hex from a hex editor, or open a real $I file copied out of $Recycle.Bin (it is read locally – nothing is uploaded).'),
          hexIn, h('div', { class: 'row', style: { marginTop: '8px' } }, btn('Decode', decode, 'primary'), fileIn),
          h('div', { class: 'row', style: { marginTop: '8px' } },
            h('span', { class: 'small muted' }, 'No $I file?'),
            btn('Sample: Vista – 8.1 (v1)', () => loadSample(1), 'sm'),
            btn('Sample: Windows 10+ (v2)', () => loadSample(2), 'sm')),
          h('details', { class: 'small muted', style: { marginTop: '6px' } },
            h('summary', null, 'Where to get a real one'),
            h('p', null, 'On Windows: delete any file to the Recycle Bin, open Command Prompt and run ',
              h('code', null, 'dir /a C:\\$Recycle.Bin'), ' then ', h('code', null, 'dir /a C:\\$Recycle.Bin\\<your SID>'),
              '. Copy the ', h('code', null, '$I…'), ' file out with ', h('code', null, 'copy "C:\\$Recycle.Bin\\<SID>\\$IABC123.docx" %USERPROFILE%\\Desktop'),
              '. No Windows machine? Use the sample buttons above or the Download button in “Build a $I file”.')),
          sampleInfo,
          parseOut)),
      panel('Windows 2000 / XP: name the file in RECYCLER',
        h('p', { class: 'small' }, 'XP renames recycled items to ', h('code', null, 'D%DriveLetter%%IndexNumber%.%FileExtension%'), '. The index is the order of deletion; folders get no extension. The hidden ', h('code', null, 'INFO2'), ' file keeps the original path, size and deletion time for each index.'),
        quizEl, h('div', { class: 'row', style: { marginTop: '8px' } }, btn('New set', drill, 'sm'))));
    build();
    drill();
  },
};
