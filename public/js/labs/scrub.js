import { h, clear, panel, header, btn, note, table, tag, hexDump } from './ui.js';
import { MEDIA, METHODS, evaluate, acceptedFor, overwritePass } from '../core/scrub.js';
import { rng } from '../core/util.js';

const VERDICT = { sanitize: ['sanitized', 'good'], clear: ['cleared only', 'warn'], no: ['not effective', 'bad'] };

export default {
  id: 'scrub', icon: '🧽', group: 'Carving & Damage', title: 'Forensic Scrubbing', slides: 'Forensically Scrubbing Data',
  blurb: 'Match wiping methods to media types and watch an overwrite pass destroy what undelete relied on.',
  lead: 'The popular claim that DoD 5220.22-M means "overwrite 7 times" is incomplete – the standard has a <strong>matrix</strong> of methods per media type: degauss, overwrite, chip erase, UV erase, remove power, or destroy.',
  mount(main) {
    let media = 'hdd';
    const matrixEl = h('div');
    const resEl = h('div');
    const mediaRow = h('div', { class: 'row' });
    const methodsEl = h('div', { class: 'choices' });

    function drawPick() {
      clear(mediaRow, MEDIA.map((m) => btn(`${m.icon} ${m.name}`, () => { media = m.id; clear(resEl); drawPick(); }, media === m.id ? 'primary' : '')));
      clear(methodsEl, METHODS.map((m) => btn(m.name, (e) => {
        const r = evaluate(media, m.id);
        e.target.classList.add(r.verdict === 'sanitize' ? 'right' : r.verdict === 'clear' ? 'meh' : 'wrong');
        clear(resEl, h('div', { class: `note ${r.verdict === 'sanitize' ? 'good' : r.verdict === 'clear' ? '' : 'bad'}` }, tag(...VERDICT[r.verdict]), ' ', r.why));
      }, 'choice')));
    }

    function drawMatrix() {
      clear(matrixEl, h('div', { class: 'scroll' }, table(['Method', ...MEDIA.map((m) => `${m.icon} ${m.name.split(' (')[0]}`)], METHODS.map((me) => h('tr', null, h('td', null, me.name), MEDIA.map((mm) => {
        const v = evaluate(mm.id, me.id).verdict;
        return h('td', { style: { textAlign: 'center' }, title: evaluate(mm.id, me.id).why }, v === 'sanitize' ? '✅' : v === 'clear' ? '◐' : '·');
      }))))), h('p', { class: 'small muted' }, '✅ sanitizes · ◐ clears (stops software recovery only) · hover a cell for the reason. Simplified for teaching.'));
    }

    // Overwrite demo
    const r = rng(5220);
    const original = new TextEncoder().encode('CONFIDENTIAL: Q3 wire to ACCT 4471-0093-2265. Delete after reading!!');
    let buf = original.slice();
    let passes = [];
    const owEl = h('div');
    function drawOW() {
      const deleted = passes.length === 0;
      clear(owEl,
        h('div', { class: 'row' }, h('b', null, deleted ? 'After "delete": the bytes are untouched' : `After pass ${passes.length}: ${passes[passes.length - 1]}`),
          tag(deleted ? 'undelete tool: FULL recovery' : 'undelete tool: nothing useful', deleted ? 'bad' : 'good')),
        hexDump(buf, { classOf: () => (deleted ? 'f-time' : '') }),
        h('div', { class: 'row', style: { marginTop: '8px' } },
          btn('Pass: character (00)', () => { buf = overwritePass(buf, 'char', r); passes.push('character 00'); drawOW(); }, 'sm'),
          btn('Pass: complement (FF)', () => { buf = overwritePass(buf, 'complement', r); passes.push('complement FF'); drawOW(); }, 'sm'),
          btn('Pass: random', () => { buf = overwritePass(buf, 'random', r); passes.push('random data'); drawOW(); }, 'sm'),
          btn('Verify', () => { clear(verifyEl, passes.length >= 3 ? note('good', `Verified: no byte of the original remains. Passes: ${passes.join(' → ')}.`) : note('', `Only ${passes.length} pass(es) – the matrix method for magnetic disks is character, complement, random, then verify.`)); }, 'sm primary'),
          btn('Start over', () => { buf = original.slice(); passes = []; clear(verifyEl); drawOW(); }, 'sm')),
        verifyEl);
    }
    const verifyEl = h('div');

    main.append(header(this),
      panel('Pick the media, then a method', mediaRow, methodsEl, resEl),
      panel('Delete vs. overwrite', h('p', { class: 'small' }, 'One sector of a deleted file. Deleting leaves it readable; overwriting replaces every byte.'), owEl),
      panel('Method × media matrix', matrixEl,
        note('info', 'Accepted for a magnetic hard drive: ', acceptedFor('hdd').map((id) => METHODS.find((m) => m.id === id).name).join(' · '))));
    drawPick();
    drawMatrix();
    drawOW();
  },
};
