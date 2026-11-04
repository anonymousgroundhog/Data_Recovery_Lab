// Data Recovery Lab – hash router + sidebar.
import { LABS, GROUPS } from './labs/index.js';
import { h, clear, note } from './labs/ui.js';

const nav = document.getElementById('nav');
const main = document.getElementById('main');
const crumb = document.getElementById('crumb');

function buildNav() {
  clear(nav,
    h('a', { href: '#/', 'data-id': '' }, h('span', { class: 'ico' }, '🏠'), 'Overview'),
    GROUPS.map((g) => [h('div', { class: 'group' }, g), LABS.filter((l) => l.group === g).map((l) => h('a', { href: `#/${l.id}`, 'data-id': l.id }, h('span', { class: 'ico' }, l.icon), l.title))]));
}

function route() {
  const id = location.hash.replace(/^#\/?/, '');
  const lab = LABS.find((l) => l.id === id) ?? LABS[0];
  for (const a of nav.querySelectorAll('a')) a.classList.toggle('on', a.dataset.id === lab.id);
  clear(main);
  crumb.textContent = lab.id ? `IT 360 · Chapter 6 › ${lab.title}` : 'IT 360 · Chapter 6 – Recovering Data';
  document.title = lab.id ? `${lab.title} – Data Recovery Lab` : 'Data Recovery Lab – IT 360 Chapter 6';
  try {
    lab.mount(main, LABS);
  } catch (e) {
    console.error(e);
    main.append(note('bad', `This lab failed to load: ${e.message}`));
  }
  nav.classList.remove('open');
  window.scrollTo(0, 0);
  main.focus({ preventScroll: true });
}

const themeBtn = document.getElementById('theme');
const syncTheme = () => (themeBtn.textContent = document.documentElement.dataset.theme === 'light' ? '☾' : '☀');
themeBtn.addEventListener('click', () => {
  const next = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
  document.documentElement.dataset.theme = next;
  try {
    localStorage.setItem('drl-theme', next);
  } catch {}
  syncTheme();
});
document.getElementById('menu').addEventListener('click', () => nav.classList.toggle('open'));

buildNav();
syncTheme();
window.addEventListener('hashchange', route);
route();
