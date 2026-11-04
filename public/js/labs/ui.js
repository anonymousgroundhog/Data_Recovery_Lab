// Tiny DOM helpers shared by the labs.

export function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props ?? {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k === 'html') el.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k in el && typeof v !== 'string') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat(Infinity)) if (c != null && c !== false) el.append(c instanceof Node ? c : String(c));
  return el;
}

export const $ = (sel, root = document) => root.querySelector(sel);

export function clear(el, ...kids) {
  el.replaceChildren(...kids.flat(Infinity).filter((k) => k != null && k !== false).map((k) => (k instanceof Node ? k : document.createTextNode(String(k)))));
  return el;
}

export function panel(title, ...kids) {
  return h('section', { class: 'panel' }, title ? h('h2', null, title) : null, ...kids);
}

export function header(lab) {
  return h('div', { class: 'lab-head' },
    h('h1', null, `${lab.icon} ${lab.title}`),
    h('div', { class: 'slides' }, `Chapter 6 slides: ${lab.slides}`),
    lab.lead ? h('p', { class: 'lead', html: lab.lead }) : null);
}

export const btn = (label, onclick, cls = '') => h('button', { class: `btn ${cls}`, type: 'button', onclick }, label);

export function field(label, input) {
  return h('label', { class: 'f' }, label, input);
}

export function select(options, value, onchange) {
  return h('select', { onchange },
    options.map((o) => {
      const [v, t] = Array.isArray(o) ? o : [o, o];
      return h('option', { value: v, selected: String(v) === String(value) }, t);
    }));
}

export function note(kind, ...kids) {
  return h('div', { class: `note ${kind}` }, ...kids);
}

export function tag(text, kind = '') {
  return h('span', { class: `tag ${kind}` }, text);
}

export const STATUS = {
  full: ['full file', 'full'],
  partial: ['partial', 'partial'],
  little: ['very little left', 'little'],
};
export const statusTag = (s) => tag(...(STATUS[s] ?? [s, '']));

/** Stable colour per file id – readable on light and dark backgrounds. */
const PALETTE = ['#58a6ff', '#3fb950', '#e3b341', '#bc8cff', '#ff7b72', '#39c5cf', '#f778ba', '#d29922', '#7ee787', '#a5d6ff', '#ffa657', '#d2a8ff'];
export const color = (i) => PALETTE[(i - 1 + PALETTE.length * 10) % PALETTE.length];

export function legend(items) {
  return h('div', { class: 'legend' }, items.map(([c, t, style]) => h('span', null, h('i', { style: { background: c, ...(style ?? {}) } }), t)));
}

export function logBox() {
  const el = h('div', { class: 'log', 'aria-live': 'polite' });
  el.add = (msg, kind) => {
    el.prepend(h('div', { class: kind ? `tag-${kind}` : '' }, msg));
    while (el.children.length > 40) el.lastChild.remove();
  };
  return el;
}

export function hexDump(bytes, { start = 0, length = bytes.length, classOf = () => '', title = null, width = 16 } = {}) {
  const pre = h('div', { class: 'hex', title });
  const end = Math.min(bytes.length, start + length);
  for (let off = start; off < end; off += width) {
    pre.append(h('span', { class: 'off' }, off.toString(16).padStart(6, '0').toUpperCase() + '  '));
    let asc = '';
    for (let i = off; i < off + width; i++) {
      if (i < end) {
        const b = bytes[i];
        pre.append(h('span', { class: `b ${classOf(i) || ''}` }, b.toString(16).padStart(2, '0').toUpperCase()), ' ');
        asc += b >= 0x20 && b < 0x7f ? String.fromCharCode(b) : '.';
      } else pre.append('   ');
      if (i === off + 7) pre.append(' ');
    }
    pre.append(h('span', { class: 'asc' }, ' ' + asc), '\n');
  }
  return pre;
}

export function modal(...kids) {
  const bg = h('div', { class: 'modal-bg', onclick: (e) => e.target === bg && bg.remove() }, h('div', { class: 'modal', role: 'dialog' }, ...kids));
  document.body.append(bg);
  return bg;
}

export function table(headers, rows) {
  return h('table', null, h('thead', null, h('tr', null, headers.map((x) => h('th', null, x)))), h('tbody', null, rows));
}
