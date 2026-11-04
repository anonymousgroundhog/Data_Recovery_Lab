// Sectors vs. clusters (allocation units) and the slack space they create.

export const SECTOR_SIZES = [512, 4096];

/**
 * How a file of `fileSize` bytes lands in clusters of `sectorsPerCluster` sectors.
 * The file system treats a cluster as fully used if even one byte of it is used.
 */
export function allocate(fileSize, sectorSize, sectorsPerCluster) {
  if (!(fileSize >= 0) || !Number.isFinite(fileSize)) throw new Error('File size must be 0 or more');
  if (!(sectorSize > 0)) throw new Error('Sector size must be positive');
  if (!(sectorsPerCluster >= 1 && sectorsPerCluster <= 128)) throw new Error('A cluster is 1 to 128 sectors');
  const clusterSize = sectorSize * sectorsPerCluster;
  const clusters = Math.ceil(fileSize / clusterSize);
  const allocated = clusters * clusterSize;
  const lastBytes = clusters ? fileSize - (clusters - 1) * clusterSize : 0;
  const lastSectorsUsed = Math.ceil(lastBytes / sectorSize);
  // Slack = bytes the OS reserved but the file does not use.
  const ramSlack = clusters ? lastSectorsUsed * sectorSize - lastBytes : 0; // rest of the last written sector
  const driveSlack = clusters ? (sectorsPerCluster - lastSectorsUsed) * sectorSize : 0; // untouched sectors
  return {
    fileSize, sectorSize, sectorsPerCluster, clusterSize, clusters, allocated,
    slack: allocated - fileSize, lastBytes, lastSectorsUsed, ramSlack, driveSlack,
    efficiency: allocated ? fileSize / allocated : 1,
  };
}

/** Per-sector map of the file's clusters: each sector is 'full', 'part' or 'slack'. */
export function sectorMap(a) {
  const out = [];
  let remaining = a.fileSize;
  for (let c = 0; c < a.clusters; c++) {
    const sectors = [];
    for (let s = 0; s < a.sectorsPerCluster; s++) {
      const used = Math.max(0, Math.min(a.sectorSize, remaining));
      remaining -= used;
      sectors.push({ used, state: used === a.sectorSize ? 'full' : used > 0 ? 'part' : 'slack' });
    }
    out.push(sectors);
  }
  return out;
}
