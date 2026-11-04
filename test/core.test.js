import { test } from 'node:test';
import assert from 'node:assert/strict';
import { allocate, sectorMap } from '../public/js/core/allocation.js';
import { FatVolume, demoFat, FREE, EOC } from '../public/js/core/fat.js';
import { NtfsVolume, dataRuns } from '../public/js/core/ntfs.js';
import { buildIFile, parseIFile, info2Name, toFiletime, fromFiletime, vistaNames } from '../public/js/core/recyclebin.js';
import { ExtVolume } from '../public/js/core/ext.js';
import { tokenize, parseGrep, grep } from '../public/js/core/grep.js';
import { buildImage, carve, gradeCarve } from '../public/js/core/carve.js';
import { Terminal } from '../public/js/core/terminal.js';
import { evaluate, acceptedFor, MEDIA, METHODS } from '../public/js/core/scrub.js';
import { STAGES, SCENARIOS, consistencyCheck, zeroKnowledge } from '../public/js/core/triage.js';
import { QUESTIONS, makeQuiz } from '../public/js/core/quiz.js';
import { parseHex, rng } from '../public/js/core/util.js';

test('slide example: 42,000-byte file, 4,096-byte sectors x 10 = 2 clusters', () => {
  const a = allocate(42000, 4096, 10);
  assert.equal(a.clusterSize, 40960);
  assert.equal(a.clusters, 2);
  assert.equal(a.lastSectorsUsed, 1);
  assert.equal(a.slack, 81920 - 42000);
  assert.equal(a.ramSlack + a.driveSlack, a.slack);
  const m = sectorMap(a);
  assert.equal(m[1].filter((s) => s.state === 'slack').length, 9);
  assert.throws(() => allocate(10, 512, 129));
});

test('FAT delete zeroes the chain but leaves data; undelete of contiguous file is full', () => {
  const v = new FatVolume();
  const { entry, chain } = v.create('A.TXT', 9000);
  assert.deepEqual(v.chainOf(entry), chain);
  assert.equal(v.fat[chain.at(-1)], EOC);
  v.remove(entry.id);
  assert.ok(chain.every((c) => v.fat[c] === FREE));
  assert.ok(chain.every((c) => v.data[c].fileId === entry.id));
  assert.equal(v.displayName(entry)[0], 'σ');
  assert.equal(v.undelete(entry.id).status, 'full');
  // Overwrite part of it
  const r = v.create('B.TXT', 4000);
  assert.deepEqual(r.overwrote, ['A.TXT']);
  assert.notEqual(v.undelete(entry.id).status, 'full');
});

test('FAT fragmented file + freed neighbour fools the contiguous heuristic', () => {
  const { v, ids } = demoFat();
  v.remove(ids['PHOTO.JPG']);
  assert.equal(v.undelete(ids['PHOTO.JPG']).status, 'full');
  v.remove(ids['LEDGER.DB']);
  const u = v.undelete(ids['LEDGER.DB']);
  assert.notEqual(u.status, 'full');
  assert.ok(u.clusters.some((c) => c.why.includes('PHOTO')));
});

test('$I file round trip and slide layout', () => {
  const when = new Date('2026-03-14T15:09:26Z');
  const b = buildIFile({ path: 'C:\\Users\\alice\\x.docx', size: 48213, deletedAt: when });
  assert.equal(b.length, 544);
  assert.deepEqual([...b.subarray(0, 8)], [1, 0, 0, 0, 0, 0, 0, 0]);
  assert.deepEqual([...b.subarray(8, 11)], [0x55, 0xbc, 0x00]); // 48213 = 0xBC55
  const p = parseIFile(b);
  assert.equal(p.path, 'C:\\Users\\alice\\x.docx');
  assert.equal(p.size, 48213n);
  assert.equal(p.deletedAt.getTime(), when.getTime());
  assert.equal(fromFiletime(toFiletime(when)).getTime(), when.getTime());
  assert.equal(toFiletime(new Date(0)), 116444736000000000n);
  assert.throws(() => parseIFile(new Uint8Array(10)));
  assert.throws(() => parseIFile(parseHex('09' + '00'.repeat(40))));
});

test('$I version 2 parses', () => {
  const path = 'C:\\a.txt';
  const b = new Uint8Array(28 + (path.length + 1) * 2);
  const dv = new DataView(b.buffer);
  dv.setBigUint64(0, 2n, true);
  dv.setBigUint64(8, 77n, true);
  dv.setBigUint64(16, toFiletime(new Date('2025-01-01T00:00:00Z')), true);
  dv.setUint32(24, path.length + 1, true);
  for (let i = 0; i < path.length; i++) dv.setUint16(28 + i * 2, path.charCodeAt(i), true);
  const p = parseIFile(b);
  assert.equal(p.version, 2);
  assert.equal(p.path, path);
  assert.equal(p.size, 77n);
});

test('XP INFO2 and Vista names', () => {
  assert.equal(info2Name('C:\\docs\\plan.doc', 4), 'Dc4.doc');
  assert.equal(info2Name('D:\\folder', 1), 'Dd1');
  const n = vistaNames('C:\\x\\y.pdf', rng(1));
  assert.match(n.r, /^\$R[A-Z0-9]{6}\.pdf$/);
  assert.equal(n.i, '$I' + n.r.slice(2));
});

test('NTFS: recycle → $I, empty → recoverable, fragmented recovery exact', () => {
  const v = new NtfsVolume();
  const a = v.create('a.bin', 9000).record;
  const b = v.create('b.bin', 5000).record;
  v.purge(a.rec);
  const big = v.create('big.bin', 20000).record; // fills a's gap then continues → fragmented
  assert.ok(dataRuns(big.runs).length > 1);
  assert.equal(v.mft[a.rec], big, 'record reused');
  const { iRec } = v.recycle(big.rec);
  assert.equal(parseIFile(iRec.content).path, 'C:\\Users\\alice\\Documents\\big.bin');
  assert.match(big.name, /^\$R/);
  v.emptyBin('alice');
  assert.equal(v.recover(big.rec).status, 'full');
  assert.ok(b.inUse);
  const c = v.create('c.bin', 30000);
  assert.equal(c.reusedRecord, big); // NTFS reuses the lowest free MFT record → metadata gone
  assert.throws(() => v.recover(big.rec), /in use/);
});

test('NTFS restore from bin', () => {
  const v = new NtfsVolume();
  const r = v.create('x.txt', 5000, 'bob').record;
  v.recycle(r.rec);
  assert.equal(v.bin('bob').length, 1);
  assert.equal(v.bin('alice').length, 0);
  v.restore(r.rec);
  assert.equal(v.path(r), 'C:\\Users\\bob\\Documents\\x.txt');
});

test('Ext: hard links, symlinks, rm, extundelete via journal', () => {
  const v = new ExtVolume();
  v.write('f', 9000);
  v.link('f', 'g');
  v.symlink('f', 's');
  assert.equal(v.lookup('f').links, 2);
  assert.equal(v.rm('f').freed, false);
  assert.equal(v.lookup('g').links, 1); // data still reachable through the hard link
  assert.throws(() => v.resolve('s'), /dangling/); // the symlink stored the NAME "f", which is gone
  assert.equal(v.rm('g').freed, true);
});

test('Ext: dangling symlink and journal recovery', () => {
  const v = new ExtVolume({ journalSize: 3 });
  v.write('f', 9000);
  v.symlink('f', 's');
  v.rm('f');
  assert.throws(() => v.resolve('s'), /dangling/);
  const r = v.extundelete();
  assert.equal(r[0].status, 'full');
  for (let i = 0; i < 4; i++) v.write(`n${i}`, 0); // journal wraps
  assert.equal(v.extundelete()[0].status, 'none');
});

test('Ext: reused blocks make recovery partial', () => {
  const v = new ExtVolume({ journalSize: 20 });
  v.write('a', 3 * 4096);
  v.rm('a');
  v.write('b', 4096);
  const r = v.extundelete()[0];
  assert.equal(r.good, 2);
  assert.equal(r.status, 'partial');
});

test('grep parsing and context like GNU grep', () => {
  assert.deepEqual(tokenize(`grep -i 'two words' f > out.txt`), ['grep', '-i', 'two words', 'f', '>', 'out.txt']);
  const o = parseGrep(['-i', '-a', '-B10', '-A', '100', 'forensics', '/dev/sda2']);
  assert.deepEqual([o.ignoreCase, o.text, o.before, o.after, o.pattern, o.files[0]], [true, true, 10, 100, 'forensics', '/dev/sda2']);
  assert.equal(parseGrep(['-iaB2', 'x']).before, 2);
  assert.throws(() => parseGrep(['-B', 'x']));
  const lines = ['a', 'b', 'HIT', 'c', 'd', 'e', 'f', 'hit', 'g'];
  assert.deepEqual(grep(parseGrep(['-i', '-B1', '-A1', 'hit']), lines).lines, ['b', 'HIT', 'c', '--', 'f', 'hit', 'g']);
  assert.deepEqual(grep(parseGrep(['hit']), lines).lines, ['hit']);
  assert.deepEqual(grep(parseGrep(['-c', '-i', 'hit']), lines).lines, ['2']);
  assert.match(grep(parseGrep(['hit']), lines, { binary: true, name: 'd' }).lines[0], /binary file matches/);
});

test('terminal walkthrough completes every objective', () => {
  const t = new Terminal();
  t.run(`wall "going down"`);
  t.run('sudo init 1');
  t.run(`grep -i -a -B10 -A100 'forensics' /dev/sda2 > file.txt`);
  t.run('extundelete /dev/sda4 --restore-all');
  t.run('apt-get install scalpel');
  t.setScalpelTypes(['JPEG']);
  t.run('scalpel /dev/sdb1 -o out');
  assert.match(t.run('scalpel /dev/sdb1 -o out').out[0], /non-empty/);
  assert.deepEqual([...t.done].sort(), ['account', 'extundelete', 'found', 'init1', 'pass', 'saved', 'scalpel', 'wall']);
});

test('terminal: grepping while users are logged in overwrites evidence', () => {
  const t = new Terminal();
  const out = t.run(`sudo grep -i -a -A100 forensics /dev/sda2`).out.join('\n');
  assert.match(out, /overwritten/);
  assert.ok(!t.done.has('pass'));
  assert.ok(!t.done.has('wall'));
});

test('carving: aligned full headers have no false positives; short unaligned headers do', () => {
  const { img, files } = buildImage(360);
  const g = gradeCarve(carve(img), files);
  assert.equal(g.filter((x) => x.verdict === 'false positive').length, 0);
  assert.equal(g.length, files.length);
  assert.ok(g.find((x) => x.truth?.name === 'evidence.jpg').verdict.startsWith('corrupt'));
  assert.ok(g.find((x) => x.truth?.name === 'taxes.pdf').verdict.startsWith('partial'));
  assert.equal(g.find((x) => x.truth?.name === 'scan.bmp').endedBy, 'size field');
  const loose = gradeCarve(carve(img, { aligned: false, shortHeaders: true }), files);
  assert.ok(loose.filter((x) => x.verdict === 'false positive').length > 0);
});

test('scrub matrix', () => {
  assert.equal(evaluate('optical', 'degauss').verdict, 'no');
  assert.equal(evaluate('ram', 'power').verdict, 'sanitize');
  assert.equal(evaluate('hdd', 'delete').verdict, 'no');
  for (const m of MEDIA) {
    assert.ok(acceptedFor(m.id).includes('destroy'));
    for (const me of METHODS) assert.ok(evaluate(m.id, me.id).why);
  }
});

test('triage: every scenario reaches an end along correct answers', () => {
  for (const s of SCENARIOS) {
    let stage = 'connect';
    let steps = 0;
    while (stage) {
      const st = STAGES[stage];
      assert.equal(st.options.filter((o) => o.good(s) === true).length, 1, `${s.id}/${stage} has one right answer`);
      stage = st.next(s);
      assert.ok(++steps < 10);
    }
  }
  assert.ok(consistencyCheck().files.some((f) => f.ok === false));
  assert.ok(zeroKnowledge().files.every((f) => f.ok === true));
});

test('quiz bank is well formed', () => {
  for (const q of QUESTIONS) {
    assert.ok(q.a >= 0 && q.a < q.c.length, q.q);
    assert.equal(new Set(q.c).size, q.c.length, q.q);
  }
  const qz = makeQuiz(10, 42);
  assert.equal(qz.length, 10);
  for (const q of qz) assert.ok(QUESTIONS.find((x) => x.q === q.q).c[QUESTIONS.find((x) => x.q === q.q).a] === q.c[q.a]);
});
