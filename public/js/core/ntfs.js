// A toy NTFS volume: MFT records + cluster bitmap + the Vista+ Recycle Bin.
import { grade, rng } from './util.js';
import { buildIFile, vistaNames, I_FILE_SIZE } from './recyclebin.js';

const SYSTEM_FILES = ['$MFT', '$MFTMirr', '$LogFile', '$Volume', '$AttrDef', '.', '$Bitmap', '$Boot', '$BadClus', '$Secure', '$UpCase', '$Extend'];
export const FIRST_USER_RECORD = 16;
export const RESIDENT_LIMIT = 700; // small files live inside the MFT record itself

export class NtfsVolume {
  constructor({ clusters = 40, clusterSize = 4096, seed = 7, start = '2026-10-12T14:00:00Z' } = {}) {
    this.n = clusters;
    this.clusterSize = clusterSize;
    this.bitmap = new Uint8Array(clusters);
    this.data = new Array(clusters).fill(null);
    for (let c = 0; c < 4; c++) {
      this.bitmap[c] = 1;
      this.data[c] = { system: true };
    }
    this.mft = SYSTEM_FILES.map((name, rec) => ({ rec, name, dir: 'C:\\', system: true, inUse: true, runs: [], size: 0 }));
    this.rand = rng(seed);
    this.clock = new Date(start).getTime();
    this.users = {};
    this.nextFileId = 1;
    this.addUser('alice');
    this.addUser('bob');
  }

  addUser(name) {
    const rid = 1001 + Object.keys(this.users).length;
    this.users[name] = `S-1-5-21-1004336348-1177238915-682003330-${rid}`;
  }

  tick(minutes = 7) {
    this.clock += minutes * 60000;
    return new Date(this.clock);
  }

  record(rec) {
    const r = this.mft[rec];
    if (!r) throw new Error(`No MFT record ${rec}`);
    return r;
  }

  freeClusters() {
    return this.bitmap.reduce((a, b) => a + (b ? 0 : 1), 0);
  }

  path(r) {
    return `${r.dir}\\${r.name}`.replace(/\\\\+/g, '\\');
  }

  /** NTFS reuses the lowest free MFT record – which destroys the old file's metadata. */
  allocRecord() {
    for (let i = FIRST_USER_RECORD; i < this.mft.length; i++) if (!this.mft[i].inUse) return i;
    while (this.mft.length < FIRST_USER_RECORD) this.mft.push({ rec: this.mft.length, name: '(reserved)', system: true, inUse: false, runs: [] });
    return this.mft.length;
  }

  allocClusters(need) {
    const out = [];
    for (let c = 0; c < this.n && out.length < need; c++) if (!this.bitmap[c]) out.push(c);
    return out.length === need ? out : null;
  }

  create(name, size, owner = 'alice', dir = null) {
    name = String(name).trim();
    if (!name) throw new Error('File name required');
    if (!(size > 0)) throw new Error('File size must be positive');
    if (!this.users[owner]) throw new Error(`Unknown user ${owner}`);
    dir ??= `C:\\Users\\${owner}\\Documents`;
    if (this.mft.some((r) => r.inUse && !r.system && r.dir === dir && r.name.toLowerCase() === name.toLowerCase())) throw new Error(`${name} already exists`);
    const resident = size <= RESIDENT_LIMIT;
    const runs = resident ? [] : this.allocClusters(Math.ceil(size / this.clusterSize));
    if (!runs) throw new Error('Disk full – not enough free clusters');
    const recNo = this.allocRecord();
    const old = this.mft[recNo];
    const fileId = this.nextFileId++;
    const victims = new Set();
    runs.forEach((c, i) => {
      if (this.data[c]?.fileId) victims.add(this.data[c].name);
      this.bitmap[c] = 1;
      this.data[c] = { fileId, part: i, name };
    });
    const t = this.tick();
    const r = { rec: recNo, fileId, name, dir, size, runs, resident, owner, sid: this.users[owner], inUse: true, created: t, modified: t, seq: (old?.seq ?? 0) + 1 };
    this.mft[recNo] = r;
    return { record: r, reusedRecord: old && !old.system ? old : null, overwrote: [...victims] };
  }

  binDir(owner) {
    return `C:\\$Recycle.Bin\\${this.users[owner]}`;
  }

  /** Delete key: rename to $R, write a $I metadata record. No bits removed. */
  recycle(rec) {
    const r = this.record(rec);
    if (r.system || !r.inUse) throw new Error('Cannot recycle that record');
    if (r.inBin) throw new Error(`${r.name} is already in the Recycle Bin`);
    const original = this.path(r);
    const names = vistaNames(original, this.rand);
    const deletedAt = this.tick();
    const iRecNo = this.allocRecord();
    const iRec = {
      rec: iRecNo, fileId: this.nextFileId++, name: names.i, dir: this.binDir(r.owner), size: I_FILE_SIZE, runs: [], resident: true,
      owner: r.owner, sid: r.sid, inUse: true, created: deletedAt, modified: deletedAt, isIFile: true, partner: rec,
      content: buildIFile({ path: original, size: r.size, deletedAt }), seq: (this.mft[iRecNo]?.seq ?? 0) + 1,
    };
    this.mft[iRecNo] = iRec;
    Object.assign(r, { inBin: true, original, name: names.r, dir: this.binDir(r.owner), partner: iRecNo });
    return { r, iRec };
  }

  restore(rec) {
    const r = this.record(rec);
    if (!r.inBin) throw new Error(`${r.name} is not in the Recycle Bin`);
    const i = this.record(r.partner);
    i.inUse = false;
    i.deletedAt = this.tick(1);
    const cut = r.original.lastIndexOf('\\');
    Object.assign(r, { inBin: false, dir: r.original.slice(0, cut), name: r.original.slice(cut + 1), partner: undefined });
    return r;
  }

  /** Mark the record deleted and its clusters free in the bitmap. Data stays. */
  release(rec) {
    const r = this.record(rec);
    r.inUse = false;
    r.deletedAt = this.tick(1);
    for (const c of r.runs) this.bitmap[c] = 0;
    return r;
  }

  /** Shift+Delete: bypass the Recycle Bin. */
  purge(rec) {
    const r = this.record(rec);
    if (r.system || !r.inUse) throw new Error('Cannot delete that record');
    if (r.inBin) return this.emptyBin(r.owner);
    return [this.release(rec)];
  }

  emptyBin(owner = null) {
    const freed = [];
    for (const r of this.mft) {
      if (r.inUse && !r.system && r.dir.startsWith('C:\\$Recycle.Bin\\') && (!owner || r.owner === owner)) freed.push(this.release(r.rec));
    }
    return freed;
  }

  bin(owner = null) {
    return this.mft.filter((r) => r.inUse && r.inBin && (!owner || r.owner === owner));
  }

  /** Recovery from the MFT: the record still lists the exact clusters (data runs), even if fragmented. */
  recover(rec) {
    const r = this.record(rec);
    if (r.inUse) throw new Error(`Record ${rec} is in use – nothing to recover`);
    if (r.resident) return { record: r, clusters: [], good: 1, need: 1, status: 'full', resident: true };
    const clusters = r.runs.map((c, i) => {
      const d = this.data[c];
      const ok = !this.bitmap[c] && d?.fileId === r.fileId && d.part === i;
      return { cluster: c, ok, why: ok ? 'intact' : this.bitmap[c] ? `reallocated to ${d?.name}` : 'overwritten' };
    });
    const good = clusters.filter((x) => x.ok).length;
    return { record: r, clusters, good, need: clusters.length, status: grade(good, clusters.length) };
  }
}

/** Compress a cluster list into NTFS-style data runs: [{start, length}] */
export function dataRuns(clusters) {
  const runs = [];
  for (const c of clusters) {
    const last = runs[runs.length - 1];
    if (last && last.start + last.length === c) last.length++;
    else runs.push({ start: c, length: 1 });
  }
  return runs;
}
