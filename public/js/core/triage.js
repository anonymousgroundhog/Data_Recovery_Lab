// "Failed" hard drive triage (physical damage) and logical-damage repair strategies.

export const SCENARIOS = [
  {
    id: 'ok-ish', title: 'Laptop "won\'t boot"', story: 'A suspect laptop shows "Operating System not found". The owner says it "died".',
    spins: true, recognized: true, failsAfterRepair: false, damage: null,
  },
  {
    id: 'pcb', title: 'Burnt smell', story: 'A desktop drive from a house fire area. There is a faint burnt smell near the circuit board.',
    spins: false, recognized: false, failsAfterRepair: true, damage: 'pcb',
  },
  {
    id: 'click', title: 'Click of death', story: 'A seized external drive clicks rhythmically when powered.',
    spins: true, recognized: false, failsAfterRepair: true, damage: 'heads',
  },
  {
    id: 'motor', title: 'Silent drive', story: 'A server drive makes no sound at all. The board looks clean.',
    spins: false, recognized: false, failsAfterRepair: true, damage: 'motor',
  },
];

/**
 * Each stage: options with `good(s)` → true/false/'meh' for scenario s. `reveal(s)` explains what you observe.
 * `next(s)` picks the following stage id (or null when finished).
 */
export const STAGES = {
  connect: {
    q: 'Step 1 – How do you hook the drive up?',
    options: [
      { t: 'Connect it to a working test system as a secondary drive (data cable only)', good: () => true, why: 'Correct: the test system boots from its own drive, so the suspect drive is not written to.' },
      { t: 'Install it as the boot drive of the test system', good: () => false, why: 'Booting from evidence writes logs, swap and timestamps to it – and a damaged drive may not survive.' },
      { t: 'Open the case at your desk to look at the platters', good: () => false, why: 'Dust ruins platters. Only clean-room facilities should open a drive.' },
    ],
    next: () => 'listen',
  },
  listen: {
    q: 'Step 2 – Boot the test system from its own drive. What do you do first?',
    options: [
      { t: 'Listen: are the platters spinning? Is the drive recognized?', good: () => true, why: 'Correct: sound and recognition decide the next branch.' },
      { t: 'Run chkdsk /f on the suspect drive right away', good: () => false, why: 'chkdsk changes the file system and may delete files – never on evidence before imaging.' },
      { t: 'Tap the drive on the desk to free the heads', good: () => false, why: 'Physical shocks cause head crashes and make damage worse.' },
    ],
    reveal: (s) => `You hear: ${s.spins ? 'platters spinning' : 'nothing – the platters are not spinning'}${s.damage === 'heads' ? ', plus a rhythmic clicking' : ''}. The BIOS ${s.recognized ? 'recognizes' : 'does NOT recognize'} the drive.`,
    next: (s) => (s.spins && s.recognized ? 'copy' : 'repair'),
  },
  copy: {
    q: 'Step 3 – The drive is spinning and recognized. Now?',
    options: [
      { t: 'Copy / image all files, virus-check them, verify integrity with hashes', good: () => true, why: 'Correct: get the data off first, then check it and prove it unchanged.' },
      { t: 'Repair the boot sector first so the OS starts', good: () => false, why: 'Repairs modify evidence. Copy first; repair only working copies.' },
      { t: 'Send it to a data recovery company', good: () => 'meh', why: 'Unnecessary cost and chain-of-custody risk – you can copy it yourself.' },
    ],
    next: () => null,
  },
  repair: {
    q: 'Step 4 – Not spinning or not recognized. Next move?',
    options: [
      { t: 'Try limited repair, then image the drive with a tool like DCFLdd', good: () => true, why: 'Correct: limited, non-invasive fixes first, then make a forensic image immediately.' },
      { t: 'Run fsck/chkdsk until the drive mounts', good: () => false, why: 'File-system repair cannot fix hardware and can destroy evidence.' },
      { t: 'Go straight to data recovery specialists', good: () => 'meh', why: 'Reasonable, but the slides try limited repair + imaging first.' },
    ],
    reveal: (s) => (s.failsAfterRepair ? 'The limited repair did not help – the drive still cannot be imaged.' : 'Limited repair worked; DCFLdd produced an image and hash.'),
    next: (s) => (s.failsAfterRepair ? 'specialist' : null),
  },
  specialist: {
    q: 'Step 5 – Still failing. What now?',
    options: [
      { t: 'Send it to data recovery specialists with a clean room', good: () => true, why: 'Correct: clean rooms control dust, microbes and particles.' },
      { t: 'Swap the circuit board yourself in the office', good: () => false, why: 'Only a last resort once the data is already considered lost.' },
      { t: 'Put it in the freezer overnight', good: () => false, why: 'Condensation damages platters – not a forensic procedure.' },
    ],
    reveal: () => 'The lab reports the data is considered lost by normal means. You may try a last-resort repair.',
    next: () => 'lastResort',
  },
  lastResort: {
    q: 'Last resort – which repair matches the symptoms?',
    options: [
      { t: 'Swap the circuit board from a matching healthy drive', good: (s) => s.damage === 'pcb', why: 'Burnt smell / dead electronics point to the controller board.' },
      { t: 'Swap the read/write head assembly', good: (s) => s.damage === 'heads', why: 'Clicking means the heads cannot read – replace the head stack (clean room only).' },
      { t: 'Move the platters into a healthy drive', good: (s) => s.damage === 'motor', why: 'A dead spindle motor: move the platters to a working mechanism.' },
    ],
    next: () => null,
  },
};

// ---------- Logical damage ----------

export const CORRUPTIONS = [
  { id: 'dots', text: '\\Projects has no "." and ".." entries' },
  { id: 'loop', text: '\\Photos\\2024 points back to \\Photos (recursive directory)' },
  { id: 'free', text: 'Volume reports negative free space (-1,204 MB)' },
  { id: 'orphans', text: 'Lost cluster chains with no directory entry' },
  { id: 'txn', text: 'Power failed mid-write: half-finished metadata transaction' },
];

export const LOGICAL_FILES = [
  { name: 'plan.docx', dir: '\\Projects' },
  { name: 'budget.xlsx', dir: '\\Projects' },
  { name: 'beach.jpg', dir: '\\Photos\\2024' },
  { name: 'party.jpg', dir: '\\Photos\\2024' },
  { name: 'resume.pdf', dir: '\\Documents' },
  { name: '(unnamed – orphan chain)', dir: null, orphan: true },
  { name: '(unnamed – orphan chain)', dir: null, orphan: true },
];

/** Consistency checking (chkdsk / fsck): fast, repairs in place, may delete what it cannot fit. */
export function consistencyCheck({ journaling = false } = {}) {
  let orphanN = 0;
  const log = [];
  if (journaling) log.push('Journal replayed – the half-finished transaction was rolled back to a stable state.');
  else log.push('No journal – the half-finished transaction is guessed at and may leave inconsistent metadata.');
  log.push('Recreated "." and ".." in \\Projects.', 'Broke the recursive link in \\Photos\\2024 by deleting the bad index entry.', 'Recalculated the free-space bitmap.');
  const files = LOGICAL_FILES.map((f) => {
    if (f.orphan) return { ...f, result: `FOUND.000\\FILE${String(orphanN++).padStart(4, '0')}.CHK`, ok: 'meh', note: 'data kept, name lost' };
    if (f.dir === '\\Photos\\2024') return { ...f, result: 'deleted', ok: false, note: 'removed along with the looping directory' };
    return { ...f, result: `${f.dir}\\${f.name}`, ok: true, note: 'kept in place' };
  });
  return { minutes: 2, repaired: true, log, files };
}

/** Zero-knowledge analysis: rebuild from scratch by scanning for structures; extract, don't repair. */
export function zeroKnowledge() {
  let n = 0;
  const log = ['Scanned every sector for MFT/inode records, directory entries and file boundaries.', 'Rebuilt a directory tree in memory – the damaged volume was NOT modified.', 'Extracted files to E:\\recovered\\ (a different drive).'];
  const files = LOGICAL_FILES.map((f) =>
    f.orphan
      ? { ...f, result: `E:\\recovered\\orphans\\file${n++}.bin`, ok: true, note: 'carved by file boundaries' }
      : { ...f, result: `E:\\recovered${f.dir}\\${f.name}`, ok: true, note: 'rebuilt from its record' },
  );
  return { minutes: 47, repaired: false, log, files };
}
