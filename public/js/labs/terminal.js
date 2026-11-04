import { h, clear, panel, header, btn, note, modal, table } from './ui.js';
import { Terminal, OBJECTIVES } from '../core/terminal.js';
import { SIGNATURES } from '../core/carve.js';

export default {
  id: 'terminal', icon: '⌨️', group: 'Linux & Mac', title: 'Linux Recovery Terminal', slides: 'Manual Recovery with grep · Linux Run Levels · Linux Tools (extundelete, Scalpel)',
  blurb: 'wall → init 1 → grep -i -a -B -A on a raw partition, then extundelete and Scalpel.',
  lead: 'A practice evidence workstation. Search raw free space on <code>/dev/sda2</code> for a deleted memo, restore Ext4 files with <code>extundelete</code>, and carve <code>/dev/sdb1</code> with <code>scalpel</code>. Type <code>help</code> to list commands.',
  mount(main) {
    let t;
    let hist = [];
    let hi = 0;
    const screen = h('div', { class: 'term', role: 'log', 'aria-label': 'Terminal' });
    const checklist = h('ul', { class: 'checklist' });
    const input = h('input', { spellcheck: false, autocomplete: 'off', 'aria-label': 'Command' });
    const promptEl = h('span', { class: 'p' });
    const inRow = h('div', { class: 'inrow' }, promptEl, input);

    function line(text, cls = '') {
      const el = h('div', { class: cls });
      const keys = [t.part.secrets.ACCOUNT, t.part.secrets.PASSPHRASE];
      let rest = text;
      while (rest) {
        const idx = keys.map((k) => rest.indexOf(k)).filter((i) => i >= 0).sort((a, b) => a - b)[0];
        if (idx == null) {
          el.append(rest);
          break;
        }
        const k = keys.find((x) => rest.startsWith(x, idx));
        el.append(rest.slice(0, idx), h('span', { class: 'hit' }, k));
        rest = rest.slice(idx + k.length);
      }
      screen.insertBefore(el, inRow);
    }

    function setPrompt() {
      promptEl.textContent = t.prompt() + ' ';
      promptEl.className = t.runlevel === 1 ? 'p root' : 'p';
    }

    function reset() {
      t = new Terminal();
      hist = [];
      clear(screen, inRow);
      line('Evidence workstation – Ubuntu 24.04 (simulated). Run level 5. Type "help".', 'warn');
      line('Case: an employee deleted a memo. Find it in the free space of /dev/sda2 without letting anyone overwrite it.', 'warn');
      setPrompt();
      drawChecklist();
    }

    function drawChecklist() {
      clear(checklist, OBJECTIVES.map((o) => h('li', { class: t.done.has(o.id) ? 'done' : '' }, o.text)));
    }

    function exec(cmd) {
      line(t.prompt() + ' ' + cmd, t.runlevel === 1 ? 'root' : 'p');
      const res = t.run(cmd);
      if (res.clear) clear(screen, inRow);
      for (const l of res.out) line(l, l.startsWith('⚠') ? 'warn' : '');
      if (res.editConf) editConf();
      setPrompt();
      drawChecklist();
      screen.scrollTop = screen.scrollHeight;
    }

    function editConf() {
      const boxes = SIGNATURES.map((s) => h('label', { style: { display: 'block' } }, h('input', { type: 'checkbox', value: s.type, checked: t.scalpelTypes.has(s.type) }), ' ', h('code', null, s.ext), ` – ${s.type}`));
      const m = modal(h('h2', null, 'nano /etc/scalpel/scalpel.conf'),
        h('p', { class: 'small muted' }, 'Every file type starts commented out (#). Tick a type to uncomment its line.'),
        h('div', { style: { columns: 2 } }, boxes),
        h('div', { class: 'row', style: { marginTop: '12px' } }, btn('Save (Ctrl+O) & exit', () => {
          t.setScalpelTypes(boxes.map((b) => b.querySelector('input')).filter((i) => i.checked).map((i) => i.value));
          line(`[ Wrote scalpel.conf – enabled: ${[...t.scalpelTypes].join(', ') || 'nothing'} ]`, 'warn');
          m.remove();
          input.focus();
        }, 'primary')));
    }

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const v = input.value;
        input.value = '';
        if (v.trim()) {
          hist.push(v);
          hi = hist.length;
        }
        exec(v);
      } else if (e.key === 'ArrowUp' && hist.length) {
        hi = Math.max(0, hi - 1);
        input.value = hist[hi];
        e.preventDefault();
      } else if (e.key === 'ArrowDown') {
        hi = Math.min(hist.length, hi + 1);
        input.value = hist[hi] ?? '';
        e.preventDefault();
      } else if (e.key === 'l' && e.ctrlKey) {
        e.preventDefault();
        clear(screen, inRow);
      }
    });
    screen.addEventListener('click', () => window.getSelection().isCollapsed && input.focus());

    const hint = (c) => btn(c, () => { input.value = c; input.focus(); }, 'sm');
    main.append(header(this),
      h('div', { class: 'grid2', style: { gridTemplateColumns: 'minmax(0, 2fr) minmax(260px, 1fr)' } },
        panel(null, screen, h('div', { class: 'row', style: { marginTop: '8px' } }, btn('Reset workstation', () => { reset(); input.focus(); }), h('span', { class: 'muted small' }, 'Click a hint to paste it:'),
          hint('who'), hint('wall "Going to single-user mode for forensics in 1 minute"'), hint('sudo init 1'), hint("grep -i -a -B10 -A100 'forensics' /dev/sda2 > file.txt"), hint('cat file.txt'))),
        h('div', null,
          panel('Objectives', checklist),
          panel('grep flags',
            table(['Flag', 'Meaning'], [['-i', 'Ignore case'], ['-a', 'Treat binary as text'], ['-B n', 'n lines Before the match'], ['-A n', 'n lines After the match'], ['-n', 'Show line numbers'], ['-c', 'Count matches']].map(([a, b]) => h('tr', null, h('td', null, h('code', null, a)), h('td', null, b))))),
          panel('Run levels',
            table(['Level', 'Meaning'], [['1', 'Single-user mode'], ['2', 'Not used'], ['3', 'Multiuser, no GUI'], ['4', 'Not used'], ['5', 'Multiuser with GUI']].map(([a, b]) => h('tr', null, h('td', null, a), h('td', null, b))))),
          note('info', 'Tip: ', h('span', { class: 'kbd' }, '↑'), ' / ', h('span', { class: 'kbd' }, '↓'), ' recall history; ', h('span', { class: 'kbd' }, 'Ctrl+L'), ' clears.'))));
    reset();
    input.focus();
  },
};
