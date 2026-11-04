// Forensically scrubbing data: which sanitization method fits which media (simplified DoD 5220.22-M matrix).

export const MEDIA = [
  { id: 'hdd', name: 'Magnetic hard drive', icon: '💽' },
  { id: 'tape', name: 'Magnetic tape', icon: '📼' },
  { id: 'floppy', name: 'Floppy disk', icon: '💾' },
  { id: 'optical', name: 'CD / DVD (optical)', icon: '💿' },
  { id: 'flash', name: 'SSD / USB flash (EEPROM-type)', icon: '🔌' },
  { id: 'eprom', name: 'EPROM (UV-erasable chip)', icon: '🔲' },
  { id: 'ram', name: 'DRAM / SRAM (volatile)', icon: '🧠' },
];

export const METHODS = [
  { id: 'delete', name: 'Delete + empty Recycle Bin' },
  { id: 'format', name: 'Quick format' },
  { id: 'over1', name: 'Overwrite – single character' },
  { id: 'over3', name: 'Overwrite – char, complement, random + verify' },
  { id: 'degauss', name: 'Degauss (Type I / Type II degausser)' },
  { id: 'chip', name: 'Full chip erase' },
  { id: 'uv', name: 'UV erase' },
  { id: 'power', name: 'Remove all power' },
  { id: 'destroy', name: 'Destroy (disintegrate, incinerate, pulverize, shred, melt)' },
];

// verdict: 'sanitize' = acceptable, 'clear' = only stops casual recovery, 'no' = ineffective / not applicable
const M = {
  hdd: { over1: 'clear', over3: 'sanitize', degauss: 'sanitize', destroy: 'sanitize' },
  tape: { over1: 'clear', degauss: 'sanitize', destroy: 'sanitize' },
  floppy: { over1: 'clear', over3: 'clear', degauss: 'sanitize', destroy: 'sanitize' },
  optical: { destroy: 'sanitize' },
  flash: { over1: 'clear', over3: 'clear', chip: 'sanitize', destroy: 'sanitize' },
  eprom: { uv: 'sanitize', destroy: 'sanitize' },
  ram: { power: 'sanitize', over1: 'clear', destroy: 'sanitize' },
};

const WHY = {
  delete: 'Deleting only marks the space free in the FAT/MFT/bitmap – every byte is still there for an undelete tool.',
  format: 'A quick format rebuilds empty file-system tables; the old data clusters are untouched and can be carved.',
  'hdd:over1': 'One pass of a single character defeats software tools (clearing) but the matrix asks for more for sanitizing.',
  'hdd:over3': 'Character, its complement, then random data, followed by verification – the matrix method for magnetic disks.',
  'hdd:degauss': 'A strong magnetic field scrambles the magnetic domains (the drive is no longer usable afterwards).',
  'tape:over1': 'Overwriting tape clears it, but degaussing is the matrix choice for sanitizing.',
  'tape:degauss': 'Degaussing is the standard way to sanitize magnetic tape.',
  'floppy:degauss': 'Floppies are magnetic media – degaussing erases them.',
  'optical:destroy': 'Pressed or burned discs cannot be magnetically erased or reliably overwritten; destruction is the only option.',
  'optical:degauss': 'Optical media is not magnetic – a degausser does nothing to it.',
  'flash:chip': 'Flash/EEPROM needs a full chip erase (then overwrite) – wear-leveling hides old blocks from normal overwrites.',
  'flash:over1': 'Wear-leveling remaps blocks, so an overwrite through the OS may miss old copies.',
  'flash:over3': 'Wear-leveling remaps blocks, so even multiple passes may miss old copies – use full chip erase.',
  'flash:degauss': 'Flash memory stores charge, not magnetism – degaussing has no effect.',
  'eprom:uv': 'Ultraviolet light erases an EPROM through its quartz window.',
  'ram:power': 'Volatile memory loses its contents once all power (including batteries) is removed.',
  'ram:over1': 'Overwriting RAM clears it while powered; removing power is the sanitizing step.',
};

export function evaluate(mediaId, methodId) {
  if (!M[mediaId]) throw new Error(`Unknown media ${mediaId}`);
  const verdict = M[mediaId][methodId] ?? 'no';
  let why = WHY[`${mediaId}:${methodId}`] ?? WHY[methodId];
  if (!why) {
    if (methodId === 'destroy') why = 'Physical destruction always works – the media cannot be reused.';
    else if (verdict === 'no') why = `Not an accepted method for ${MEDIA.find((m) => m.id === mediaId).name.toLowerCase()}.`;
    else why = 'Accepted for this media type.';
  }
  return { verdict, why };
}

export function acceptedFor(mediaId) {
  return METHODS.filter((m) => M[mediaId][m.id] === 'sanitize').map((m) => m.id);
}

/** One overwrite pass over a buffer: 'char' (0x00), 'complement' (bitwise NOT of previous char), 'random'. */
export function overwritePass(bytes, kind, rand, ch = 0x00) {
  const out = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) out[i] = kind === 'char' ? ch : kind === 'complement' ? ~ch & 0xff : Math.floor(rand() * 256);
  return out;
}
