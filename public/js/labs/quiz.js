import { h, clear, panel, header, btn, note, tag } from './ui.js';
import { makeQuiz, TOPICS, QUESTIONS } from '../core/quiz.js';

export default {
  id: 'quiz', icon: '📝', group: 'Review', title: 'Chapter 6 Quiz', slides: 'All',
  blurb: `${QUESTIONS.length} questions on clusters, FAT/NTFS, the Recycle Bin, Linux, Mac, carving and damaged media.`,
  lead: 'Pick topics and a length. Answers are explained right away.',
  mount(main) {
    const chosen = new Set();
    const nIn = h('select', null, [5, 10, 15, 20, QUESTIONS.length].map((n) => h('option', { value: n, selected: n === 10 }, n === QUESTIONS.length ? `All ${n}` : n)));
    const area = h('div');
    const topicRow = h('div', { class: 'row' }, TOPICS.map((t) => h('label', { class: 'small' }, h('input', { type: 'checkbox', onchange: (e) => (e.target.checked ? chosen.add(t) : chosen.delete(t)) }), ` ${t} `)));

    function start() {
      const qs = makeQuiz(Number(nIn.value), Date.now(), [...chosen]);
      let i = 0;
      let score = 0;
      const missed = [];
      const show = () => {
        if (i >= qs.length) {
          clear(area, h('div', { class: 'score' }, `${score} / ${qs.length}`), h('p', null, score === qs.length ? 'Perfect!' : 'Review the ones you missed:'),
            missed.map((q) => note('', h('b', null, q.q), h('div', null, `Answer: ${q.c[q.a]}`), h('div', { class: 'small' }, q.why))), btn('New quiz', start, 'primary'));
          return;
        }
        const q = qs[i];
        let answered = false;
        const fb = h('div');
        clear(area,
          h('div', { class: 'row' }, tag(`Question ${i + 1} of ${qs.length}`, 'info'), tag(q.topic), tag(`score ${score}`, 'warn')),
          h('h3', { style: { color: 'var(--txt-strong)' } }, q.q),
          h('div', { class: 'choices' }, q.c.map((c, k) => btn(c, (e) => {
            if (answered) return;
            answered = true;
            const ok = k === q.a;
            if (ok) score++;
            else missed.push(q);
            e.target.classList.add(ok ? 'right' : 'wrong');
            if (!ok) e.target.parentNode.children[q.a].classList.add('right');
            clear(fb, note(ok ? 'good' : 'bad', ok ? '✓ Correct. ' : '✗ Not quite. ', q.why), btn(i + 1 < qs.length ? 'Next →' : 'See score', () => { i++; show(); }, 'primary'));
          }, 'choice'))),
          fb);
      };
      show();
    }

    main.append(header(this), panel('Setup', h('div', { class: 'row' }, h('span', { class: 'small muted' }, 'Topics (none = all):')), topicRow, h('div', { class: 'row' }, h('label', { class: 'small' }, 'Questions: ', nIn), btn('Start', start, 'primary'))), panel(null, area));
    start();
  },
};
