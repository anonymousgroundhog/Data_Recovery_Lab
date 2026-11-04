# Data Recovery Lab

Interactive browser simulations of the concepts in **IT 360, Chapter 6 – Recovering Data**. Students delete files, watch what the file system actually changes, and try to get the data back before it is overwritten. Nothing touches a real disk; every volume, partition and image is simulated in the browser.

## Running it

Requires **Node.js 18 or later** on Windows, macOS or Linux. There are no dependencies to install.

| OS | Easiest | From a terminal |
|---|---|---|
| Windows | Double-click `start-windows.bat` | `npm start` |
| macOS | Double-click `start-mac.command` (first time: right-click → Open) | `npm start` |
| Linux | `./start-linux.sh` | `npm start` |

The launchers open your default browser. With `npm start`, browse to <http://127.0.0.1:3000> yourself, or use `npm run open`. If port 3000 is taken, the server tries 3001, 3002 and so on.

```bash
npm start                 # http://127.0.0.1:3000
npm run open              # same, and open the browser
npm test                  # simulator logic tests (node --test)

# Different port / serve a whole lab from one machine:
PORT=8080 npm start               # macOS / Linux
HOST=0.0.0.0 npm start            # macOS / Linux: reachable from other machines
set PORT=8080 && npm start        # Windows cmd
$env:PORT=8080; npm start         # Windows PowerShell
```

## Labs

| Lab | What students do | Slides |
|---|---|---|
| 🧱 Sectors & Clusters | Size a file into 512 / 4,096-byte sectors and 1–128-sector clusters; see RAM slack and drive slack. Includes the 42,000-byte slide example. | Sectors and Clusters, Clusters Are All-or-Nothing |
| 📇 FAT Undelete | Save, delete and undelete on a FAT volume. Deleting sets the name's first byte to `0xE5` (σ) and zeroes the chain. Undelete assumes the file was contiguous, so fragmented files come back wrong. Results use DiskDigger's green / white / red. | FAT16/FAT32, Deleting on FAT |
| 🗂️ NTFS & the Recycle Bin | Two users, per-SID `$Recycle.Bin` folders, `$R`/`$I` pairs, Shift+Delete, emptying the bin, MFT record reuse, a cluster bitmap, and exact recovery of fragmented files from data runs. | NTFS, Deleting on NTFS, Recycle Bin Win 7–10 |
| 🔎 $I & INFO2 Inspector | Build a 544-byte `$I` file and see each field highlighted in hex (little-endian size, FILETIME, UTF-16 path). Decode pasted hex or a real `$I` file (version 1 and 2). Practise XP `Dc4.doc` naming. | Recycle Bin Win 2000/XP & 7–10 |
| 🐧 Ext Inodes, Links & Journal | A mini shell for `write`, `ln`, `ln -s`, `rm`, `cat` and `extundelete`. Shows link counts, dangling symlinks, zeroed block pointers, the block and inode bitmaps, and the journal wrapping. | Ext File System, Inodes and Links, Linux Tools |
| ⌨️ Linux Recovery Terminal | A guided case: `who`, `wall`, `init 1`, `grep -i -a -B10 -A100 'forensics' /dev/sda2 > file.txt`, then `extundelete` and `apt-get install scalpel` → edit `scalpel.conf` → `scalpel /dev/sdb1 -o out` (the output folder must be empty). If you grep while users are still logged in, their writes overwrite evidence. | Manual Recovery with grep, Run Levels, Linux Tools |
| 🪓 File Carving & DiskDigger | A 64-sector raw image with the slide's file signatures. Compare Dig Deep (file system, names) with Dig Deeper (carving, no names). Toggle sector alignment and 2-byte headers to see false positives. Includes a fragmented JPEG, a PDF with its footer overwritten, a hex viewer and a "name that header" drill. | File Carving, Dig Deep vs. Dig Deeper |
| 🩺 Failed Drive Triage | Four "dead drive" cases taken through the five evaluation steps, then last-resort repairs (circuit board, heads or platters). Scored, with feedback on each choice. | Physical Damage, Evaluating a Failed Drive, Last-Resort Repairs |
| 🧩 Logical Damage Repair | One corrupted volume repaired two ways: chkdsk-style consistency checking (fast, but deletes and renames files) and zero-knowledge analysis (slow, extracts everything to another drive). Includes a journaling toggle. | Logical Damage, Logical Recovery Techniques |
| 🧽 Forensic Scrubbing | Match methods to media (degauss, overwrite, chip erase, UV erase, remove power, destroy) using a simplified DoD 5220.22-M matrix. Watch character / complement / random overwrite passes and a verify step. | Forensically Scrubbing Data |
| 📝 Chapter 6 Quiz | 42 questions, filterable by topic, with an explanation for each answer. | All |

The overview page also compares FAT, NTFS, Ext, HFS+ and APFS deletion behaviour and the slides' tools for each OS.

## Simplifications

These are teaching models, not byte-exact file system implementations:

- Volumes have about 40–64 clusters, and files are tracked by cluster rather than by byte.
- The FAT undelete heuristic is "first cluster, then the next free clusters". Real tools differ.
- NTFS emptying is shown as clearing the MFT in-use flag and the bitmap bits. Small files (≤ 700 bytes) are resident in the MFT record.
- The slides describe the `$I` deletion time as "seconds since 1601". The real format, used here, is a FILETIME: 100-nanosecond intervals since Jan 1, 1601 UTC.
- The scrubbing matrix is a condensed version of the DoD table.

## Project layout

```
server.js               zero-dependency static server (+ --open)
public/index.html       app shell
public/css/style.css    theme (follows the slide deck palette, light/dark)
public/js/app.js        hash router + sidebar
public/js/core/         pure simulation logic (unit-tested)
public/js/labs/         one module per lab (UI)
test/core.test.js       node --test suite
```
