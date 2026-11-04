import { h, clear, panel, header, btn, note, tag } from './ui.js';
import { SCENARIOS, STAGES } from '../core/triage.js';

export default {
  id: 'damaged', icon: '🩺', group: 'Carving & Damage', title: 'Failed Drive Triage', slides: 'Physical Damage · Evaluating a "Failed" Hard Drive · Last-Resort Repairs',
  blurb: 'Walk a "dead" drive through the evaluation steps – connect, listen, copy or image, escalate.',
  lead: 'Physical damage (head crash, failed motor, scratched disc) often causes logical damage too. End users usually <strong>can\'t</strong> repair it – attempts make it worse. Follow the evaluation steps and only escalate when needed.',
  mount(main) {
    let sc;
    let stage;
    let score;
    let path;
    let tries; // attempts on the current stage – only the first one scores
    let stagesDone;
    const area = h('div');
    const pick = h('div', { class: 'row' });

    function start(s) {
      sc = s;
      stage = 'connect';
      score = 0;
      path = [];
      tries = 0;
      stagesDone = 0;
      draw();
    }

    function draw() {
      if (!sc) {
        clear(area, h('p', { class: 'muted' }, 'Choose a case above.'));
        return;
      }
      const done = stage == null;
      const st = STAGES[stage];
      clear(area,
        h('div', { class: 'row' }, h('b', null, sc.title), tag(`score ${score}`, 'warn')),
        h('p', null, sc.story),
        path.map((p) => h('div', { class: `note ${p.good === true ? 'good' : p.good === 'meh' ? '' : 'bad'}` }, h('b', null, p.q), h('div', null, `➜ ${p.t}`), h('div', { class: 'small' }, p.why), p.reveal ? h('div', { class: 'small', style: { marginTop: '4px' } }, '🔊 ', h('i', null, p.reveal)) : null)),
        done
          ? note('info', h('b', null, `Finished – score ${score} / ${stagesDone * 2}. `), 'Evidence handled: ', sc.damage ? `the root cause was a ${{ pcb: 'failed circuit board', heads: 'head crash', motor: 'seized spindle motor' }[sc.damage]}.` : 'the drive was healthy – only the boot files were damaged, so a simple copy/image worked.')
          : h('div', null, h('h3', null, st.q), h('div', { class: 'choices' }, st.options.map((o) => btn(o.t, () => choose(st, o), 'choice')))));
    }

    function choose(st, o) {
      const g = o.good(sc);
      if (tries++ === 0) score += g === true ? 2 : g === 'meh' ? 1 : 0;
      if (g !== true) {
        // Show the mistake, but let the student retry the same step.
        path.push({ q: st.q, t: o.t, good: g, why: o.why + '  Try again.' });
        draw();
        return;
      }
      path.push({ q: st.q, t: o.t, good: g, why: o.why, reveal: st.reveal?.(sc) });
      stage = st.next(sc);
      tries = 0;
      stagesDone++;
      draw();
    }

    clear(pick, SCENARIOS.map((s) => btn(s.title, () => start(s))), btn('Random case', () => start(SCENARIOS[Math.floor(Math.random() * SCENARIOS.length)]), 'gold'));
    main.append(header(this),
      panel('Pick a case', pick),
      h('div', { class: 'grid2' },
        panel('Evaluation', area),
        panel('Reference: the five steps',
          h('ol', { class: 'steps' },
            h('li', null, 'Connect the drive to a working ', h('b', null, 'test system'), ' (data cable only).'),
            h('li', null, 'Boot from the test system\'s own drive – ', h('b', null, 'listen'), ': platters spinning?'),
            h('li', null, 'Recognized? → copy all files, virus-check, verify integrity.'),
            h('li', null, 'Not spinning / not recognized → limited repair, then image (e.g. ', h('b', null, 'DCFLdd'), ').'),
            h('li', null, 'Still failing → ', h('b', null, 'data recovery specialists'), '.')),
          h('h3', null, 'Last resort (data already "lost")'),
          h('ul', { class: 'steps' }, h('li', null, 'Swap the circuit board'), h('li', null, 'Swap the read/write head assembly'), h('li', null, 'Move the platters into a healthy drive')),
          note('', h('b', null, 'Clean room: '), 'an environment with controlled levels of dust, microbes and particles. Never open a drive anywhere else.'))));
    draw();
  },
};
