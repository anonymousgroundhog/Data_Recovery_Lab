// A toy Ext3/Ext4 block group: superblock, block bitmap, inode bitmap, inode table, root directory, journal.
import { grade } from './util.js';

export const BLOCK_SIZES = [1024, 2048, 4096];
export const FIRST_USER_INODE = 12; // 1–11 reserved (2 = root, 11 = lost+found)
export const SYSTEM_BLOCKS = ['superblock', 'group descriptors', 'block bitmap', 'inode bitmap', 'inode table', 'inode table'];

export class ExtVolume {
  constructor({ blocks = 48, blockSize = 4096, inodes = 24, journalSize = 8 } = {}) {
    if (!BLOCK_SIZES.includes(blockSize)) throw new Error('Block size must be 1024, 2048 or 4096');
    this.nBlocks = blocks;
    this.blockSize = blockSize;
    this.nInodes = inodes;
    this.journalSize = journalSize;
    this.blockBitmap = new Uint8Array(blocks);
    this.blockData = new Array(blocks).fill(null);
    SYSTEM_BLOCKS.forEach((label, b) => {
      this.blockBitmap[b] = 1;
      this.blockData[b] = { system: label };
    });
    this.inodeBitmap = new Uint8Array(inodes + 1); // 1-based
    this.inodes = new Array(inodes + 1).fill(null);
    for (let i = 1; i < FIRST_USER_INODE; i++) this.inodeBitmap[i] = 1;
    this.inodes[2] = { ino: 2, type: 'dir', links: 3, size: blockSize, blocks: [], reserved: 'root /' };
    this.inodes[11] = { ino: 11, type: 'dir', links: 2, size: blockSize, blocks: [], reserved: 'lost+found' };
    this.dir = new Map([['lost+found', 11]]);
    this.journal = [];
    this.deleted = []; // ground truth for the UI, not visible to recovery tools
    this.nextFileId = 1;
    this.clock = 0;
  }

  get superblock() {
    return {
      blockSize: this.blockSize, blocksCount: this.nBlocks, inodesCount: this.nInodes,
      freeBlocks: this.blockBitmap.reduce((a, b) => a + (b ? 0 : 1), 0),
      freeInodes: this.inodeBitmap.slice(1).reduce((a, b) => a + (b ? 0 : 1), 0),
      blocksPerGroup: 32768, journal: 'has_journal (ext3/ext4)',
    };
  }

  lookup(name) {
    const ino = this.dir.get(name);
    if (!ino) throw new Error(`${name}: No such file or directory`);
    return this.inodes[ino];
  }

  journalLog(kind, inode, name) {
    this.journal.push({ seq: ++this.clock, kind, name, copy: structuredClone(inode) });
    while (this.journal.length > this.journalSize) this.journal.shift();
  }

  allocInode() {
    for (let i = FIRST_USER_INODE; i <= this.nInodes; i++) if (!this.inodeBitmap[i]) return i;
    throw new Error('No free inodes');
  }

  /** Ext prefers a contiguous run of blocks; it fragments only when it must. */
  allocBlocks(need) {
    let run = 0;
    for (let b = 0; b < this.nBlocks; b++) {
      run = this.blockBitmap[b] ? 0 : run + 1;
      if (run === need) return Array.from({ length: need }, (_, k) => b - need + 1 + k);
    }
    const out = [];
    for (let b = 0; b < this.nBlocks && out.length < need; b++) if (!this.blockBitmap[b]) out.push(b);
    if (out.length < need) throw new Error('No space left on device');
    return out;
  }

  write(name, size) {
    name = String(name).trim();
    if (!/^[\w.-]+$/.test(name)) throw new Error('Use letters, digits, dot, dash or underscore in names');
    if (this.dir.has(name)) throw new Error(`${name} already exists`);
    if (!(size >= 0)) throw new Error('Size must be 0 or more');
    const need = Math.ceil(size / this.blockSize);
    const blocks = need ? this.allocBlocks(need) : [];
    const ino = this.allocInode();
    const fileId = this.nextFileId++;
    const victims = new Set();
    blocks.forEach((b, i) => {
      if (this.blockData[b]?.fileId) victims.add(this.blockData[b].name);
      this.blockBitmap[b] = 1;
      this.blockData[b] = { fileId, part: i, name };
    });
    const old = this.inodes[ino];
    const inode = { ino, type: 'file', size, links: 1, blocks, fileId, mtime: ++this.clock, dtime: null };
    this.inodeBitmap[ino] = 1;
    this.inodes[ino] = inode;
    this.dir.set(name, ino);
    this.journalLog('create', inode, name);
    return { inode, overwrote: [...victims], reusedInode: old?.dtime ? old : null };
  }

  /** Hard link: a second name for the same inode; link count goes up. */
  link(target, name) {
    const inode = this.lookup(target);
    if (inode.type === 'dir') throw new Error('hard link not allowed for directory');
    if (this.dir.has(name)) throw new Error(`${name} already exists`);
    this.dir.set(name, inode.ino);
    inode.links++;
    this.journalLog('link', inode, name);
    return inode;
  }

  /** Symbolic link: its own inode that stores a path (fast symlink – no data blocks). */
  symlink(target, name) {
    if (this.dir.has(name)) throw new Error(`${name} already exists`);
    const ino = this.allocInode();
    const inode = { ino, type: 'symlink', target, size: target.length, links: 1, blocks: [], fileId: this.nextFileId++, mtime: ++this.clock, dtime: null };
    this.inodeBitmap[ino] = 1;
    this.inodes[ino] = inode;
    this.dir.set(name, ino);
    this.journalLog('symlink', inode, name);
    return inode;
  }

  /** rm: drop the name, decrement the link count; at 0 the inode and blocks are freed. */
  rm(name) {
    const inode = this.lookup(name);
    if (inode.type === 'dir') throw new Error(`rm: cannot remove '${name}': Is a directory`);
    this.dir.delete(name);
    inode.links--;
    if (inode.links > 0) return { inode, freed: false };
    this.inodeBitmap[inode.ino] = 0;
    for (const b of inode.blocks) this.blockBitmap[b] = 0;
    this.deleted.push({ name, ino: inode.ino, fileId: inode.fileId, size: inode.size, blocks: [...inode.blocks], type: inode.type });
    inode.dtime = ++this.clock;
    inode.zeroed = inode.blocks.length;
    inode.blocks = []; // ext3/ext4 wipe the block pointers – why recovery leans on the journal
    inode.size = 0;
    return { inode, freed: true };
  }

  /** cat-style lookup that follows symbolic links. */
  resolve(name, depth = 0) {
    if (depth > 8) throw new Error('Too many levels of symbolic links');
    const inode = this.lookup(name);
    if (inode.type === 'symlink') {
      if (!this.dir.has(inode.target)) throw new Error(`${name}: No such file or directory (dangling link → ${inode.target})`);
      return this.resolve(inode.target, depth + 1);
    }
    return inode;
  }

  namesFor(ino) {
    return [...this.dir].filter(([, i]) => i === ino).map(([n]) => n);
  }

  /**
   * extundelete --restore-all: find inodes that are now free, then use the newest journal copy
   * that still had block pointers. Restored files go to RECOVERED_FILES/.
   */
  extundelete() {
    const latest = new Map();
    for (const j of this.journal) if (j.copy.type === 'file' || j.copy.type === 'symlink') latest.set(j.copy.fileId, j);
    const results = [];
    for (const d of this.deleted) {
      const j = latest.get(d.fileId);
      if (!j) {
        results.push({ name: d.name, ino: d.ino, status: 'none', why: 'no journal copy left (journal wrapped) – block pointers are zeroed' });
        continue;
      }
      const blocks = j.copy.blocks.map((b, i) => {
        const bd = this.blockData[b];
        const ok = !this.blockBitmap[b] && bd?.fileId === d.fileId && bd.part === i;
        return { block: b, ok };
      });
      const good = blocks.filter((x) => x.ok).length;
      const status = blocks.length ? grade(good, blocks.length) : 'full';
      results.push({
        name: d.name, ino: d.ino, blocks, good, need: blocks.length, status,
        out: `RECOVERED_FILES/${d.name}`,
        why: status === 'full' ? 'restored from journal copy' : 'some blocks were reallocated to newer files',
      });
    }
    return results;
  }
}
