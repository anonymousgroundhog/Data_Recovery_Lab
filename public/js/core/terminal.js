// A simulated Linux evidence workstation for the Chapter 6 commands.
import { rng } from './util.js';
import { tokenize, parseGrep, grep } from './grep.js';
import { ExtVolume } from './ext.js';
import { buildImage, carve, SIGNATURES } from './carve.js';

const ACCOUNT = 'ACCT 4471-0093-2265';
const PASSPHRASE = 'blue-heron-1987';

/** /dev/sda2: free space holding fragments of a deleted memo, surrounded by binary noise. */
export function buildPartition(seed = 6) {
  const r = rng(seed);
  const junk = () => {
    let s = '';
    const n = r.int(20, 70);
    for (let i = 0; i < n; i++) s += r() < 0.35 ? String.fromCharCode(r.int(1, 31)) : String.fromCharCode(r.int(33, 126));
    return s;
  };
  const memo = [
    'From: k.ross@northwind-supply.example',
    'To: d.vance@northwind-supply.example',
    'Subject: before Monday',
    '',
    'Dana - wire the Q3 overflow to the usual place:',
    `   ${ACCOUNT}  (Cayman branch)`,
    '   amount: $182,400.00',
    '',
    'Then wipe this thread. IT says deleting it is enough,',
    'but do it before the Forensics team images the server.',
  ];
  const tail = [];
  for (let i = 0; i < 44; i++) tail.push(i === 38 ? `   P.S. the vault passphrase is ${PASSPHRASE}` : i % 9 === 4 ? '' : `   ${['shipping', 'invoices', 'payroll', 'vendors'][i % 4]} note ${i}: nothing unusual here.`);
  const lines = [];
  for (let i = 0; i < 120; i++) lines.push(junk());
  const memoStart = lines.length;
  lines.push(...memo, ...tail, '-- K.');
  for (let i = 0; i < 18; i++) lines.push(junk());
  lines.push('lowercase forensics appears in this browser cache line too');
  for (let i = 0; i < 90; i++) lines.push(junk());
  const keyLine = memoStart + memo.length - 1;
  return {
    lines,
    keyLine,
    accountLine: memoStart + 5,
    passLine: memoStart + memo.length + 38,
    secrets: { ACCOUNT, PASSPHRASE },
  };
}

export const OBJECTIVES = [
  { id: 'wall', text: 'Warn logged-in users with wall' },
  { id: 'init1', text: 'Switch to single-user mode (init 1)' },
  { id: 'found', text: 'Find the deleted memo that mentions "forensics"' },
  { id: 'account', text: 'Recover the account number (lines BEFORE the match)' },
  { id: 'pass', text: 'Recover the passphrase (lines AFTER the match)' },
  { id: 'saved', text: 'Save the results to file.txt with >' },
  { id: 'extundelete', text: 'Run extundelete on /dev/sda4 to restore deleted Ext4 files' },
  { id: 'scalpel', text: 'Install scalpel, enable file types, carve /dev/sdb1 into an empty folder' },
];

const RUNLEVELS = { 0: 'halt', 1: 'single-user mode', 2: 'not used (user-definable)', 3: 'full multiuser, no GUI', 4: 'not used (user-definable)', 5: 'full multiuser with GUI', 6: 'reboot' };

export class Terminal {
  constructor() {
    this.part = buildPartition();
    this.runlevel = 5;
    this.users = ['jdoe', 'msmith'];
    this.warned = false;
    this.done = new Set();
    this.files = new Map(); // cwd files created by redirects / tools
    this.dirs = new Map(); // dir → [names]
    this.scalpelInstalled = false;
    this.scalpelTypes = new Set();
    this.damaged = false;
    this.history = [];
    // /dev/sda4: an ext4 volume with some deleted files.
    this.ext = new ExtVolume({ journalSize: 6 });
    this.ext.write('report.docx', 9000);
    this.ext.write('ledger.csv', 4000);
    this.ext.write('photo1.jpg', 12000);
    this.ext.rm('ledger.csv');
    this.ext.rm('photo1.jpg');
    this.ext.write('cache.tmp', 3000); // lands in ledger.csv's freed block
    this.image = buildImage(360);
  }

  prompt() {
    return this.runlevel === 1 ? 'root@evidence:~#' : 'examiner@evidence:~$';
  }

  /** Execute one command line. Returns {out: string[], clear?, editConf?} */
  run(line) {
    line = line.trim();
    if (!line) return { out: [] };
    this.history.push(line);
    let words;
    try {
      words = tokenize(line);
    } catch (e) {
      return { out: [`bash: ${e.message}`] };
    }
    let redirect = null;
    const gt = words.indexOf('>');
    if (gt >= 0) {
      redirect = words[gt + 1];
      if (!redirect) return { out: ['bash: syntax error near unexpected token `newline\''] };
      words = words.slice(0, gt);
    }
    const sudo = words[0] === 'sudo';
    if (sudo) words = words.slice(1);
    const [cmd, ...args] = words;
    const fn = this[`cmd_${cmd?.replace(/-/g, '_')}`];
    if (!fn) return { out: [`${cmd}: command not found  (type "help")`] };
    let res;
    try {
      res = fn.call(this, args, { sudo, redirect });
    } catch (e) {
      res = { out: [e.message] };
    }
    if (redirect && res.out && !res.noRedirect) {
      this.files.set(redirect, res.out.join('\n'));
      if (redirect === 'file.txt' && res.grepped) this.done.add('saved');
      return { ...res, out: res.warn ?? [] };
    }
    return res;
  }

  needRoot(sudo) {
    if (this.runlevel !== 1 && !sudo) throw new Error('Permission denied (try sudo, or switch to single-user mode as root)');
  }

  cmd_help() {
    return {
      out: [
        'Commands:',
        '  who                          list logged-in users',
        '  wall "message"               broadcast a warning to all users',
        '  init <0-6>  /  runlevel      change / show the run level',
        '  grep [-i] [-a] [-B n] [-A n] [-n] [-c] PATTERN FILE [> out.txt]',
        '  ls [dir]  cat FILE  clear  history',
        '  extundelete /dev/sda4 --restore-all',
        '  apt-get install scalpel',
        '  nano /etc/scalpel/scalpel.conf',
        '  scalpel DEVICE -o OUTPUT_DIR',
        'Devices: /dev/sda2 (free space, has deleted text)  /dev/sda4 (ext4)  /dev/sdb1 (raw image for carving)',
      ],
    };
  }

  cmd_clear() {
    return { out: [], clear: true };
  }

  cmd_history() {
    return { out: this.history.map((h, i) => `${String(i + 1).padStart(4)}  ${h}`) };
  }

  cmd_who() {
    const me = [`examiner tty1         2026-11-04 08:58`];
    return { out: me.concat(this.users.map((u, i) => `${u.padEnd(8)} pts/${i}         2026-11-04 09:1${i} (10.0.0.${21 + i})`)) };
  }

  cmd_whoami() {
    return { out: [this.runlevel === 1 ? 'root' : 'examiner'] };
  }

  cmd_wall(args) {
    const msg = args.join(' ');
    if (!msg) return { out: ['wall: no message given'] };
    this.warned = true;
    this.done.add('wall');
    return { out: [``, `Broadcast message from examiner@evidence (tty1):`, ``, msg, ``] };
  }

  cmd_runlevel() {
    return { out: [`N ${this.runlevel}`, `(${RUNLEVELS[this.runlevel]})`] };
  }

  cmd_init(args, { sudo }) {
    const lvl = Number(args[0]);
    if (!(lvl in RUNLEVELS)) return { out: ['Usage: init {0|1|2|3|4|5|6}'] };
    if (!sudo && this.runlevel !== 1) return { out: ['init: must be superuser (use sudo init N)'] };
    if (lvl === 0 || lvl === 6) return { out: ['Refusing to halt/reboot the evidence workstation in this simulator.'] };
    const out = [];
    if (lvl === 1) {
      if (!this.warned && this.users.length) out.push('⚠ Users were dropped without warning – best practice is to send a `wall` message first.');
      if (this.users.length) out.push(`Logging out: ${this.users.join(', ')}`);
      this.users = [];
      this.done.add('init1');
    } else if (this.users.length === 0) {
      this.users = ['jdoe', 'msmith'];
    }
    this.runlevel = lvl;
    out.push(`Switching to run level ${lvl}: ${RUNLEVELS[lvl]}.`);
    return { out };
  }

  cmd_ls(args) {
    const d = args.find((a) => !a.startsWith('-'));
    if (d) {
      const key = d.replace(/\/$/, '');
      if (!this.dirs.has(key)) return { out: [`ls: cannot access '${d}': No such file or directory`] };
      return { out: this.dirs.get(key).length ? this.dirs.get(key) : [] };
    }
    return { out: [...[...this.dirs.keys()].map((k) => `${k}/`), ...this.files.keys()] };
  }

  cmd_cat(args) {
    const f = args[0];
    if (!f) return { out: ['cat: missing operand'] };
    if (f === '/etc/scalpel/scalpel.conf') return { out: this.scalpelConf() };
    if (f.startsWith('/dev/')) return { out: ['(binary device – use grep -a, not cat)'] };
    if (!this.files.has(f)) return { out: [`cat: ${f}: No such file or directory`] };
    return { out: this.files.get(f).split('\n') };
  }

  cmd_grep(args, { sudo, redirect }) {
    const o = parseGrep(args);
    if (!o.files.length) return { out: ['grep: (reading standard input – give a file such as /dev/sda2)'] };
    const out = [];
    const warn = [];
    let grepped = false;
    for (const f of o.files) {
      if (f === '/dev/sda2') {
        this.needRoot(sudo);
        if (this.users.length && !this.damaged) {
          // Other users are still writing to the disk: their activity lands in the free space we are searching.
          this.damaged = true;
          for (let i = this.part.passLine - 2; i <= this.part.passLine + 2; i++) this.part.lines[i] = `msmith/.cache/thumbnails/${i}.png ${'#'.repeat(30)}`;
          warn.push(`⚠ ${this.users.join(' & ')} are still logged in – msmith's session just wrote cache files into free space on /dev/sda2.`);
          warn.push('  Some deleted data was overwritten. (Use the Reset button to try again: wall → init 1 → grep.)');
        }
        const res = grep(o, this.part.lines, { binary: true, name: f });
        const shown = res.lines.map(cleanLine);
        out.push(...shown);
        if (res.hits.includes(this.part.keyLine) && !res.binaryNotice && !o.count) {
          grepped = true;
          this.done.add('found');
          const text = shown.join('\n');
          if (text.includes(this.part.secrets.ACCOUNT)) this.done.add('account');
          if (text.includes(this.part.secrets.PASSPHRASE)) this.done.add('pass');
        }
      } else if (this.files.has(f)) {
        out.push(...grep(o, this.files.get(f).split('\n'), { name: f }).lines);
      } else {
        out.push(`grep: ${f}: No such file or directory`);
      }
    }
    if (redirect === 'file.txt' && grepped) this.done.add('saved');
    return { out: [...warn, ...out], warn, grepped };
  }

  cmd_extundelete(args, { sudo }) {
    this.needRoot(sudo);
    const dev = args.find((a) => a.startsWith('/dev/'));
    if (dev !== '/dev/sda4') return { out: [dev ? `extundelete: ${dev} is not an ext3/ext4 file system` : 'Usage: extundelete /dev/sda4 --restore-all'] };
    if (!args.includes('--restore-all')) return { out: ['No action specified; use --restore-all (or --restore-file NAME)'] };
    const res = this.ext.extundelete();
    const out = ['NOTICE: Extended attributes are not restored.', 'Loading filesystem metadata ... 1 groups loaded.', 'Loading journal descriptors ... ' + this.ext.journal.length + ' descriptors loaded.', 'Searching for recoverable inodes in directory / ...'];
    const names = [];
    for (const r of res) {
      if (r.status === 'none') out.push(`Unable to restore inode ${r.ino} (${r.name}): ${r.why}.`);
      else {
        out.push(`Restored inode ${r.ino} to file ${r.out}  [${r.good}/${r.need} blocks intact${r.status === 'full' ? '' : r.good ? ' – PARTIAL' : ' – contents overwritten by newer data'}]`);
        names.push(r.name);
      }
    }
    this.dirs.set('RECOVERED_FILES', names);
    this.done.add('extundelete');
    return { out };
  }

  cmd_apt_get(args, { sudo }) {
    if (args[0] !== 'install' || !args[1]) return { out: ['Usage: apt-get install PACKAGE'] };
    if (!sudo && this.runlevel !== 1) return { out: ['E: Could not open lock file /var/lib/dpkg/lock-frontend - open (13: Permission denied)', 'E: are you root? (try sudo)'] };
    if (args[1] !== 'scalpel') return { out: [`E: Unable to locate package ${args[1]} (only scalpel is in this simulator's mirror)`] };
    if (this.scalpelInstalled) return { out: ['scalpel is already the newest version (1.60-10).'] };
    this.scalpelInstalled = true;
    return { out: ['Reading package lists... Done', 'Setting up scalpel (1.60-10) ...', 'Edit /etc/scalpel/scalpel.conf and uncomment the file types you want.'] };
  }
  cmd_apt(args, ctx) {
    return this.cmd_apt_get(args, ctx);
  }

  scalpelConf() {
    return [
      '# scalpel.conf – uncomment a line to carve that type',
      '# extension  case  max-size  header  [footer]',
      ...SIGNATURES.map((s) => `${this.scalpelTypes.has(s.type) ? '' : '#'}\t${s.ext}\ty\t${s.max}\t${s.header.map((b) => '\\x' + b.toString(16).padStart(2, '0')).join('')}\t${s.footer ? s.footer.map((b) => '\\x' + b.toString(16).padStart(2, '0')).join('') : ''}`),
    ];
  }

  cmd_nano(args) {
    if (args[0] !== '/etc/scalpel/scalpel.conf') return { out: ['nano: this simulator only edits /etc/scalpel/scalpel.conf'] };
    if (!this.scalpelInstalled) return { out: ['/etc/scalpel/scalpel.conf: No such file (install scalpel first)'] };
    return { out: [], editConf: true, noRedirect: true };
  }
  cmd_vi(args) {
    return this.cmd_nano(args);
  }

  cmd_scalpel(args, { sudo }) {
    if (!this.scalpelInstalled) return { out: ["Command 'scalpel' not found, but can be installed with:", 'sudo apt-get install scalpel'] };
    this.needRoot(sudo);
    const o = args.indexOf('-o');
    const outDir = o >= 0 ? args[o + 1]?.replace(/\/$/, '') : null;
    const src = args.find((a, i) => !a.startsWith('-') && i !== o + 1);
    if (!src || !outDir) return { out: ['Usage: scalpel [device/dir/file] -o [output dir]'] };
    if (src !== '/dev/sdb1') return { out: [`scalpel: ${src}: cannot carve (use /dev/sdb1)`] };
    if (!this.scalpelTypes.size) return { out: ['ERROR: no file types are enabled. Uncomment lines in /etc/scalpel/scalpel.conf (nano /etc/scalpel/scalpel.conf).'] };
    if (this.dirs.get(outDir)?.length) return { out: [`Scalpel will not write to a non-empty output directory: ${outDir}`, 'Choose a new, empty directory.'] };
    const found = carve(this.image.img, { types: [...this.scalpelTypes] });
    const byExt = {};
    for (const f of found) (byExt[f.ext] ??= []).push(f.name);
    const listing = [];
    for (const [ext, names] of Object.entries(byExt)) for (const n of names) listing.push(`${ext}-0-0/${n}`);
    this.dirs.set(outDir, [...Object.keys(byExt).map((e) => `${e}-0-0/`), 'audit.txt']);
    for (const [ext, names] of Object.entries(byExt)) this.dirs.set(`${outDir}/${ext}-0-0`, names);
    this.files.set(`${outDir}/audit.txt`, listing.join('\n'));
    this.done.add('scalpel');
    return {
      out: [
        'Scalpel version 1.60',
        `Opening target "${src}"`,
        `Image file pass 1/2. ${'*'.repeat(30)} 100%`,
        `Image file pass 2/2. ${'*'.repeat(30)} 100%`,
        `Processing of image file complete. ${found.length} files carved.`,
        ...Object.entries(byExt).map(([e, n]) => `   ${e}: ${n.length}`),
        `Output written to ${outDir}/  (see ${outDir}/audit.txt)`,
      ],
    };
  }

  setScalpelTypes(types) {
    this.scalpelTypes = new Set(types);
  }
}

/** Show control characters the way a terminal would garble them. */
export function cleanLine(s) {
  return s.replace(/[\x00-\x1f]/g, '�');
}
