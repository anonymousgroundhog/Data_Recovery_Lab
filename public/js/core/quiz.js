// Chapter 6 question bank. `a` is the index of the correct choice.
import { rng } from './util.js';

export const QUESTIONS = [
  { topic: 'Clusters', q: 'A drive has 4,096-byte sectors and 10 sectors per cluster. How many clusters does a 42,000-byte file use?', c: ['1', '2', '10', '11'], a: 1, why: '40,960-byte clusters: the first is full, the second holds 1,040 bytes but counts as fully used.' },
  { topic: 'Clusters', q: 'What is the modern formal name for a cluster?', c: ['Block group', 'Allocation unit', 'Sector run', 'Extent'], a: 1, why: 'The term changed to allocation unit; "cluster" is still common.' },
  { topic: 'Clusters', q: 'How many sectors can a cluster contain?', c: ['Exactly 8', '1 to 128', '512 to 4,096', 'Always 1'], a: 1, why: 'A cluster is 1 to 128 sectors, and they need not be contiguous.' },
  { topic: 'Clusters', q: 'What size is an Advanced Format sector?', c: ['512 bytes', '1,024 bytes', '4,096 bytes', '40,960 bytes'], a: 2, why: 'Traditional sectors are 512 bytes; Advanced Format uses 4,096.' },
  { topic: 'FAT', q: 'Which is NOT something a FAT entry can record?', c: ['Next cluster of the file', 'End of cluster chain', 'The file name', 'Bad cluster'], a: 2, why: 'Names live in directory entries. FAT entries hold next/EOC/bad/reserved/available.' },
  { topic: 'FAT', q: 'What happens to a file\'s data when it is deleted on FAT?', c: ['It is zeroed', 'It is moved to slack space', 'Nothing – the clusters are just marked available', 'It is encrypted'], a: 2, why: 'Only the table changes, so the data stays until overwritten.' },
  { topic: 'FAT', q: 'Why does a more recent deletion improve the chance of recovery?', c: ['FAT keeps a 30-day backup', 'Less time for new saves to overwrite the freed clusters', 'Recent files are stored twice', 'The OS locks them'], a: 1, why: 'New files may reuse the freed clusters.' },
  { topic: 'NTFS', q: 'Which NTFS file has one base record per file and directory?', c: ['$Bitmap', '$MFT', '$LogFile', 'INFO2'], a: 1, why: 'The Master File Table plays the same role as the FAT.' },
  { topic: 'NTFS', q: 'What does the NTFS cluster bitmap track?', c: ['File names', 'One bit per cluster – allocated or free', 'Deletion times', 'Security IDs'], a: 1, why: 'Each cluster has one bit.' },
  { topic: 'NTFS', q: 'After the Recycle Bin is emptied on NTFS, the file is recoverable…', c: ['never', 'only partially', 'in full, until its clusters are overwritten', 'only with the user\'s password'], a: 2, why: 'Clusters are only marked available; the MFT still lists them.' },
  { topic: 'Recycle Bin', q: 'What is the Recycle Bin folder on Windows Vista and later?', c: ['RECYCLER', '$Recycle.Bin', 'Trash', 'RECYCLED'], a: 1, why: 'Pre-Vista used RECYCLER; Vista+ uses $Recycle.Bin.' },
  { topic: 'Recycle Bin', q: 'In Windows XP, which hidden file tracks the original location, size and deletion time?', c: ['$I', 'INFO2', '$MFT', 'desktop.ini'], a: 1, why: 'Each user\'s RECYCLER\\%SID% has an INFO2 file.' },
  { topic: 'Recycle Bin', q: 'XP renames a deleted C:\\docs\\plan.doc that was the 4th deletion to…', c: ['$R4.doc', 'Dc4.doc', 'plan.doc.del', 'D4c.doc'], a: 1, why: 'D + drive letter + index number + original extension.' },
  { topic: 'Recycle Bin', q: 'In Windows 7–10, which file holds the original deleted data?', c: ['$I…', '$R…', 'INFO2', '$MFTMirr'], a: 1, why: '$R is the renamed file; $I is the 544-byte metadata.' },
  { topic: 'Recycle Bin', q: 'In a $I file, what is stored at bytes 8–15?', c: ['Header', 'Original file size', 'Deletion time', 'Path'], a: 1, why: '0–7 header, 8–15 size, 16–23 deletion time, 24–543 path.' },
  { topic: 'Recycle Bin', q: 'The $I deletion time counts from which date?', c: ['Jan 1, 1970', 'Jan 1, 1980', 'Jan 1, 1601', 'Jan 1, 2000'], a: 2, why: 'It is a Windows FILETIME: 100-nanosecond intervals since Jan 1, 1601.' },
  { topic: 'Recycle Bin', q: 'What ties a recycled file to a specific user?', c: ['The file extension', 'The %SID% subfolder', 'The cluster number', 'The $Bitmap'], a: 1, why: 'Each user has a folder named by their Security Identifier.' },
  { topic: 'Tools', q: 'DiskDigger "Dig Deeper" differs from "Dig Deep" because it…', c: ['recovers file names', 'scans only the file system', 'carves the whole disk surface but loses names', 'only works on NTFS'], a: 2, why: 'Dig Deeper is file carving: independent of the file system, no names.' },
  { topic: 'Tools', q: 'In DiskDigger, a red result means…', c: ['full file', 'partial file', 'very little left', 'virus detected'], a: 2, why: 'Green = full, white = partial, red = very little.' },
  { topic: 'Tools', q: 'Why is Autopsy a good second tool?', c: ['It is the only legal tool', 'Free, open source – good for validating findings', 'It repairs drives', 'It needs no image'], a: 1, why: 'Validate results from one tool with another.' },
  { topic: 'Scrubbing', q: 'Which is accurate about DoD 5220.22-M?', c: ['It only says overwrite 7 times', 'It has a matrix of methods per media type', 'It bans degaussing', 'It only covers paper'], a: 1, why: '"Overwrite 7 times" is incomplete – methods depend on the media.' },
  { topic: 'Scrubbing', q: 'Which method sanitizes volatile RAM?', c: ['Degauss', 'Remove all power', 'UV erase', 'Quick format'], a: 1, why: 'Volatile memory loses data without power.' },
  { topic: 'Linux', q: 'Where does Ext store the block size?', c: ['Inode', 'Superblock', 'Journal', 'Block bitmap'], a: 1, why: 'The superblock describes the file system.' },
  { topic: 'Linux', q: 'What does an inode NOT contain?', c: ['Timestamps', 'Permissions', 'The file name and data', 'Block pointers'], a: 2, why: 'Everything about the file except its name and data.' },
  { topic: 'Linux', q: 'A file has 2 hard links. After `rm` of one name, the file is…', c: ['deleted', 'still present (link count 1)', 'moved to the trash', 'turned into a symlink'], a: 1, why: 'The file is deleted only when the link count reaches 0.' },
  { topic: 'Linux', q: 'What happens to a symbolic link when its target is deleted?', c: ['It is deleted too', 'It becomes a dangling pointer', 'It becomes a hard link', 'It keeps a copy of the data'], a: 1, why: 'A symlink is just a path, like a Windows shortcut.' },
  { topic: 'Linux', q: 'Which run level is single-user mode?', c: ['0', '1', '3', '5'], a: 1, why: '1 = single-user, 3 = multiuser no GUI, 5 = multiuser with GUI.' },
  { topic: 'Linux', q: 'In `grep -i -a -B10 -A100 forensics /dev/sda2`, what does -a do?', c: ['Search all files', 'Treat binary data as text', 'Show 100 lines after', 'Ignore case'], a: 1, why: '-i ignore case, -a binary as text, -B/-A context.' },
  { topic: 'Linux', q: 'Why send a `wall` message before `init 1`?', c: ['It speeds up grep', 'It warns logged-in users before they are dropped', 'It unmounts the disk', 'It is required by Scalpel'], a: 1, why: 'Users are logged off when you switch to single-user mode.' },
  { topic: 'Linux', q: 'Scalpel requires the output directory to be…', c: ['on the same partition', 'empty', 'named "output"', 'owned by root'], a: 1, why: 'Scalpel refuses to write into a non-empty directory.' },
  { topic: 'Linux', q: 'Which tool restores deleted files on Ext3/Ext4?', c: ['chkdsk', 'extundelete', 'MacKeeper', 'WinUndelete'], a: 1, why: 'extundelete /dev/sda4 --restore-all' },
  { topic: 'Mac', q: 'Which file system replaced HFS+ with macOS High Sierra (2017)?', c: ['ext4', 'APFS', 'NTFS', 'HFS'], a: 1, why: 'APFS – the Apple File System.' },
  { topic: 'Mac', q: 'Why do many Linux recovery techniques work on Mac OS X and later?', c: ['It runs NTFS', 'It is based on FreeBSD, a UNIX clone', 'It uses FAT32', 'Apple licenses ext4'], a: 1, why: 'macOS has UNIX roots.' },
  { topic: 'Damaged media', q: 'What is a clean room?', c: ['An evidence locker', 'An environment with controlled dust, microbes and particles', 'A wiped hard drive', 'A virtual machine'], a: 1, why: 'Opening drives anywhere else damages platters.' },
  { topic: 'Damaged media', q: 'When evaluating a failed drive, how do you connect it?', c: ['As the boot drive', 'To a test system with the data cable only, booting from the test system\'s drive', 'Through the network', 'Open the case first'], a: 1, why: 'Never boot from the suspect drive.' },
  { topic: 'Damaged media', q: 'Which is a last-resort repair?', c: ['Running chkdsk', 'Swapping the circuit board', 'Defragmenting', 'Formatting'], a: 1, why: 'Swap board, heads, or platters only when the data is already considered lost.' },
  { topic: 'Logical damage', q: 'Which is a symptom of logical damage?', c: ['Burnt smell', 'Negative free space', 'Clicking', 'Platters not spinning'], a: 1, why: 'Also recursive directories, crashes and data loss.' },
  { topic: 'Logical damage', q: 'Zero-knowledge analysis compared with consistency checking is…', c: ['faster and repairs in place', 'slower and extracts data elsewhere without repairing', 'the same thing', 'only for FAT'], a: 1, why: 'It rebuilds from scratch and copies data out.' },
  { topic: 'Logical damage', q: 'What helps NTFS 5.0 and Ext3 recover from a crash mid-write?', c: ['Journaling', 'Fragmentation', 'Slack space', 'Degaussing'], a: 0, why: 'The journal rolls back to a stable state.' },
  { topic: 'Carving', q: 'Which header (hex) marks a JPEG?', c: ['42 4D', 'FF D8', '50 4B', '4D 5A'], a: 1, why: 'BMP 42 4D, ZIP 50 4B, EXE 4D 5A.' },
  { topic: 'Carving', q: 'Bytes 50 4B at the start of a file most likely mean…', c: ['PDF', 'ZIP', 'PNG', 'MP3'], a: 1, why: '"PK" – Phil Katz, author of PKZIP.' },
  { topic: 'Carving', q: 'File carving is used when…', c: ['metadata is damaged or missing', 'the file is still listed in the directory', 'the drive is encrypted', 'you need file names'], a: 0, why: 'It finds headers/footers and extracts the data between them.' },
];

export function makeQuiz(n = 10, seed = Date.now(), topics = null) {
  const r = rng(seed);
  const pool = topics?.length ? QUESTIONS.filter((q) => topics.includes(q.topic)) : QUESTIONS;
  return r.shuffle(pool).slice(0, n).map((q) => {
    const order = r.shuffle(q.c.map((_, i) => i));
    return { ...q, c: order.map((i) => q.c[i]), a: order.indexOf(q.a) };
  });
}

export const TOPICS = [...new Set(QUESTIONS.map((q) => q.topic))];
