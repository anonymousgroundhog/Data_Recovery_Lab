// A toy FAT16/FAT32 volume: the File Allocation Table plus a root directory.
import { grade } from './util.js';

// FAT entry values. Anything >= 2 is "next cluster in the chain".
export const FREE = 0;
export const EOC = -1; // end of cluster chain
export const BAD = -2;
export const RES = -3;

export const DELETED_MARK = 'σ'; // byte 0xE5 shows as σ in code page 437

export class FatVolume {
  constructor({ clusters = 40, clusterSize = 4096, bad = [27], strategy = 'first' } = {}) {
    this.n = clusters;
    this.clusterSize = clusterSize;
    this.strategy = strategy; // 'first' = first free cluster, 'next' = keep moving forward
    this.fat = new Array(clusters).fill(FREE);
    this.fat[0] = RES;
    this.fat[1] = RES;
    for (const b of bad) if (b >= 2 && b < clusters) this.fat[b] = BAD;
    this.data = new Array(clusters).fill(null); // {fileId, part} – what is physically in the cluster
    this.dir = [];
    this.nextId = 1;
    this.cursor = 2;
  }

  clustersFor(size) {
    return Math.max(1, Math.ceil(size / this.clusterSize));
  }

  freeClusters() {
    return this.fat.reduce((n, v) => n + (v === FREE ? 1 : 0), 0);
  }

  live() {
    return this.dir.filter((e) => !e.deleted);
  }

  entry(id) {
    const e = this.dir.find((x) => x.id === id);
    if (!e) throw new Error(`No directory entry ${id}`);
    return e;
  }

  findFree(need) {
    const span = this.n - 2;
    const start = this.strategy === 'next' ? this.cursor : 2;
    const out = [];
    for (let k = 0; k < span && out.length < need; k++) {
      const c = 2 + ((start - 2 + k) % span);
      if (this.fat[c] === FREE) out.push(c);
    }
    return out.length === need ? out : null;
  }

  create(name, size) {
    name = String(name).trim();
    if (!name) throw new Error('File name required');
    if (!(size > 0)) throw new Error('File size must be positive');
    if (this.live().some((e) => e.name.toLowerCase() === name.toLowerCase())) throw new Error(`${name} already exists`);
    const chain = this.findFree(this.clustersFor(size));
    if (!chain) throw new Error('Disk full – not enough free clusters');
    const id = this.nextId++;
    const overwrote = new Set();
    chain.forEach((c, i) => {
      this.fat[c] = i < chain.length - 1 ? chain[i + 1] : EOC;
      if (this.data[c]) overwrote.add(this.data[c].fileId);
      this.data[c] = { fileId: id, part: i };
    });
    this.cursor = chain[chain.length - 1] + 1 >= this.n ? 2 : chain[chain.length - 1] + 1;
    const entry = { id, name, size, firstCluster: chain[0], deleted: false };
    this.dir.push(entry);
    const victims = [...overwrote].filter((f) => f !== id).map((f) => this.entry(f).name);
    return { entry, chain, overwrote: victims, fragmented: !isContiguous(chain) };
  }

  /** Follow the FAT from the directory entry's first cluster. Only meaningful for live files. */
  chainOf(entry) {
    const out = [];
    let c = entry.firstCluster;
    const seen = new Set();
    while (c >= 2 && !seen.has(c)) {
      seen.add(c);
      out.push(c);
      const v = this.fat[c];
      if (v === EOC || v < 2) break;
      c = v;
    }
    return out;
  }

  /** Delete: mark the dir entry with 0xE5 and zero the FAT chain. The data clusters are untouched. */
  remove(id) {
    const e = this.entry(id);
    if (e.deleted) throw new Error(`${e.name} is already deleted`);
    const chain = this.chainOf(e);
    for (const c of chain) this.fat[c] = FREE;
    e.deleted = true;
    return chain;
  }

  displayName(e) {
    return e.deleted ? DELETED_MARK + e.name.slice(1) : e.name;
  }

  /**
   * What an undelete tool can do. The chain is gone, so it only knows the first cluster
   * and the size. It assumes the file was stored contiguously and takes the next free clusters.
   */
  undelete(id) {
    const e = this.entry(id);
    if (!e.deleted) throw new Error(`${e.name} is not deleted`);
    const need = this.clustersFor(e.size);
    const picked = [];
    for (let c = e.firstCluster; c < this.n && picked.length < need; c++) {
      if (c === e.firstCluster || this.fat[c] === FREE) picked.push(c);
    }
    const clusters = picked.map((c, i) => {
      const d = this.data[c];
      const ok = this.fat[c] === FREE && d?.fileId === e.id && d.part === i;
      let why = 'recovered';
      if (!ok) {
        if (this.fat[c] !== FREE) why = `overwritten by ${this.entry(d.fileId).name}`;
        else if (d && d.fileId !== e.id) why = `holds old data of ${this.entry(d.fileId).name}`;
        else if (d) why = `wrong piece (fragment ${d.part + 1})`;
        else why = 'empty';
      }
      return { cluster: c, ok, why };
    });
    for (let i = picked.length; i < need; i++) clusters.push({ cluster: null, ok: false, why: 'ran off the end of the disk' });
    const good = clusters.filter((x) => x.ok).length;
    return { entry: e, clusters, good, need, status: grade(good, need) };
  }
}

export function isContiguous(chain) {
  return chain.every((c, i) => i === 0 || c === chain[i - 1] + 1);
}

export function fatLabel(v) {
  if (v === FREE) return 'free';
  if (v === EOC) return 'EOC';
  if (v === BAD) return 'BAD';
  if (v === RES) return 'RES';
  return String(v);
}

/** Preset that shows fragmentation fooling the "assume contiguous" heuristic. */
export function demoFat() {
  const v = new FatVolume();
  const ids = {};
  for (const [n, s] of [['BUDGET.XLS', 9000], ['MEMO.DOC', 7000], ['PHOTO.JPG', 15000], ['NOTES.TXT', 3000]]) ids[n] = v.create(n, s).entry.id;
  v.remove(ids['MEMO.DOC']);
  ids['LEDGER.DB'] = v.create('LEDGER.DB', 18000).entry.id; // fills MEMO's gap, continues after NOTES → fragmented
  return { v, ids };
}
