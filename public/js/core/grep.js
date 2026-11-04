// Enough of GNU grep to practise the slide's command:  grep -i -a -B10 -A100 'forensics' /dev/sda2 > file.txt

/** Split a command line into words, honouring '…' and "…" quotes and a trailing > redirect. */
export function tokenize(line) {
  const out = [];
  let cur = '';
  let quote = null;
  let has = false;
  for (const ch of line) {
    if (quote) {
      if (ch === quote) quote = null;
      else cur += ch;
    } else if (ch === "'" || ch === '"') {
      quote = ch;
      has = true;
    } else if (/\s/.test(ch)) {
      if (has || cur) out.push(cur);
      cur = '';
      has = false;
    } else if (ch === '>') {
      if (has || cur) out.push(cur);
      out.push('>');
      cur = '';
      has = false;
    } else {
      cur += ch;
    }
  }
  if (quote) throw new Error('unexpected EOF while looking for matching quote');
  if (has || cur) out.push(cur);
  return out;
}

/** Parse grep's arguments (everything after the word "grep"). */
export function parseGrep(args) {
  const o = { ignoreCase: false, text: false, before: 0, after: 0, count: false, lineNumbers: false, pattern: null, files: [] };
  const num = (v, flag) => {
    if (!/^\d+$/.test(v ?? '')) throw new Error(`grep: ${v ?? ''}: invalid context length argument for -${flag}`);
    return Number(v);
  };
  let i = 0;
  let flagsDone = false;
  while (i < args.length) {
    const a = args[i++];
    if (!flagsDone && a === '--') {
      flagsDone = true;
    } else if (!flagsDone && a.startsWith('--')) {
      const [k, v] = a.slice(2).split('=');
      if (k === 'ignore-case') o.ignoreCase = true;
      else if (k === 'text') o.text = true;
      else if (k === 'count') o.count = true;
      else if (k === 'line-number') o.lineNumbers = true;
      else if (k === 'before-context') o.before = num(v ?? args[i++], 'B');
      else if (k === 'after-context') o.after = num(v ?? args[i++], 'A');
      else if (k === 'context') o.before = o.after = num(v ?? args[i++], 'C');
      else throw new Error(`grep: unrecognized option '--${k}'`);
    } else if (!flagsDone && a.startsWith('-') && a.length > 1) {
      for (let k = 1; k < a.length; k++) {
        const f = a[k];
        if (f === 'i') o.ignoreCase = true;
        else if (f === 'a') o.text = true;
        else if (f === 'c') o.count = true;
        else if (f === 'n') o.lineNumbers = true;
        else if ('ABC'.includes(f)) {
          const rest = a.slice(k + 1);
          const v = num(rest || args[i++], f);
          if (f !== 'A') o.before = v;
          if (f !== 'B') o.after = v;
          break;
        } else throw new Error(`grep: invalid option -- '${f}'`);
      }
    } else if (o.pattern == null) {
      o.pattern = a;
    } else {
      o.files.push(a);
    }
  }
  if (o.pattern == null) throw new Error('Usage: grep [OPTION]... PATTERNS [FILE]...');
  return o;
}

/** Run grep over an array of lines. `binary` mimics grep's "Binary file … matches" without -a. */
export function grep(opts, lines, { binary = false, name = '(standard input)' } = {}) {
  let re;
  try {
    re = new RegExp(opts.pattern, opts.ignoreCase ? 'i' : '');
  } catch {
    re = new RegExp(opts.pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), opts.ignoreCase ? 'i' : '');
  }
  const hits = [];
  lines.forEach((l, i) => re.test(l) && hits.push(i));
  if (opts.count) return { lines: [String(hits.length)], hits };
  if (!hits.length) return { lines: [], hits };
  if (binary && !opts.text) return { lines: [`grep: ${name}: binary file matches`], hits, binaryNotice: true };
  // Merge context windows the way GNU grep does, with "--" between separate groups.
  const groups = [];
  for (const h of hits) {
    const lo = Math.max(0, h - opts.before);
    const hi = Math.min(lines.length - 1, h + opts.after);
    const g = groups[groups.length - 1];
    if (g && lo <= g.hi + 1) g.hi = Math.max(g.hi, hi);
    else groups.push({ lo, hi });
  }
  const hitSet = new Set(hits);
  const out = [];
  const ctx = opts.before || opts.after;
  groups.forEach((g, gi) => {
    if (gi && ctx) out.push('--');
    for (let i = g.lo; i <= g.hi; i++) out.push(opts.lineNumbers ? `${i + 1}${hitSet.has(i) ? ':' : '-'}${lines[i]}` : lines[i]);
  });
  return { lines: out, hits };
}
