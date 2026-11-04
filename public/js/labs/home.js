import { h, panel, table } from './ui.js';

export default {
  id: '', icon: '🏠', group: null, title: 'Overview',
  mount(main, labs) {
    main.append(
      h('div', { class: 'lab-head' },
        h('h1', null, '💽 Data Recovery Lab'),
        h('p', { class: 'lead' }, 'Interactive simulations for ', h('strong', null, 'IT 360 – Chapter 6: Recovering Data'), '. Deleting rarely removes data: file systems just mark the space free. Each lab lets you break things, recover them, and see exactly why it worked or failed. Nothing here touches your real disks.')),
      h('div', { class: 'cards' }, labs.filter((l) => l.id).map((l) => h('a', { class: 'card', href: `#/${l.id}` }, h('div', { class: 'big' }, l.icon), h('h3', null, l.title), h('p', null, l.blurb)))),
      h('div', { style: { height: '16px' } }),
      panel('What happens on delete – by operating system',
        table(['OS', 'File system', 'On delete', 'Where to look', 'Tools from the slides'], [
          ['🪟 Windows', 'FAT16 / FAT32', 'Name\'s 1st byte → 0xE5; FAT chain zeroed', 'Directory entries, unallocated clusters', 'DiskDigger, WinUndelete, FreeUndelete'],
          ['🪟 Windows', 'NTFS', 'Recycle Bin rename ($R/$I); emptying clears MFT in-use flag + bitmap bits', '$Recycle.Bin\\%SID%, $MFT, $Bitmap', 'OSForensics, Autopsy, EnCase, FTK'],
          ['🐧 Linux', 'Ext3 / Ext4', 'Link count → 0; inode & blocks freed; block pointers zeroed', 'Journal, raw partition (grep)', 'extundelete, Scalpel, grep'],
          ['🍎 Mac OS', 'HFS+ → APFS (High Sierra, 2017)', 'Catalog/metadata entry removed; FreeBSD roots → many Linux techniques apply', 'Volume metadata, unallocated space', 'MacKeeper (Files Recovery → Undelete), Scalpel'],
        ].map((r) => h('tr', null, r.map((c, i) => h('td', null, i === 0 ? h('b', null, c) : c)))))),
      panel('Good practice the labs reinforce',
        h('ul', null,
          h('li', null, 'The more recent the deletion, the better the odds – new saves overwrite freed space.'),
          h('li', null, 'Image first; recover to a ', h('em', null, 'different'), ' drive; never repair the original evidence.'),
          h('li', null, 'Validate results with a second tool (e.g. Autopsy).'),
          h('li', null, 'If you are not comfortable with an OS, leave its forensics to someone qualified.'))));
  },
};
