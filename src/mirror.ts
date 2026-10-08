import {
  copyFileSync,
  existsSync,
  linkSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  unlinkSync,
  watch,
  type FSWatcher,
} from "node:fs";
import { join } from "node:path";

/**
 * Core skips registering static dirs that don't exist at startup, so keep these
 * present in the mirror even if the active build lacks them (e.g. no es5 build).
 */
const REQUIRED_DIRS = ["static", "frontend_latest", "frontend_es5"];

export interface SyncResult {
  files: number;
  linked: number;
  removed: number;
  copied: boolean;
}

export const buildDir = (treePath: string) => join(treePath, "hass_frontend");
export const mirrorBuildDir = (mirrorDir: string) => join(mirrorDir, "hass_frontend");

/** Hardlink `src` into `dst`, falling back to a copy across filesystems. */
function place(src: string, dst: string, result: SyncResult): void {
  try {
    linkSync(src, dst);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "EXDEV") throw err;
    copyFileSync(src, dst);
    result.copied = true;
  }
  result.linked++;
}

/**
 * Make `dst` mirror `src` in place. Files already hardlinked to the same inode are
 * skipped, so re-running this is cheap (a stat per file).
 */
function syncDir(src: string, dst: string, result: SyncResult): void {
  mkdirSync(dst, { recursive: true });
  const seen = new Set<string>();

  for (const entry of readdirSync(src, { withFileTypes: true })) {
    seen.add(entry.name);
    const s = join(src, entry.name);
    const d = join(dst, entry.name);
    const dstStat = lstatSync(d, { throwIfNoEntry: false });

    if (entry.isDirectory()) {
      if (dstStat && !dstStat.isDirectory()) unlinkSync(d);
      syncDir(s, d, result);
      continue;
    }
    if (!entry.isFile()) continue;

    result.files++;
    if (dstStat) {
      const srcStat = statSync(s);
      if (
        dstStat.isFile() &&
        (dstStat.ino === srcStat.ino ||
          // Copy fallback: treat same size + not older as up to date.
          (result.copied && dstStat.size === srcStat.size && dstStat.mtimeMs >= srcStat.mtimeMs))
      ) {
        continue;
      }
      rmSync(d, { recursive: true, force: true });
    }
    place(s, d, result);
  }

  for (const name of readdirSync(dst)) {
    if (!seen.has(name)) {
      rmSync(join(dst, name), { recursive: true, force: true });
      result.removed++;
    }
  }
}

function ensureRequiredDirs(dir: string): void {
  for (const name of REQUIRED_DIRS) mkdirSync(join(dir, name), { recursive: true });
}

function emptyResult(): SyncResult {
  return { files: 0, linked: 0, removed: 0, copied: false };
}

/**
 * Switch the mirror to a new tree: build `hass_frontend.next` next to the live dir,
 * then swap it in with two renames. Core keeps path strings, not inodes, so it
 * picks up the new files on the next request.
 */
export function switchMirror(treePath: string, mirrorDir: string): SyncResult {
  const src = buildDir(treePath);
  const live = mirrorBuildDir(mirrorDir);
  const next = `${live}.next`;
  const old = `${live}.old`;
  const result = emptyResult();

  rmSync(next, { recursive: true, force: true });
  rmSync(old, { recursive: true, force: true });
  if (existsSync(src)) syncDir(src, next, result);
  ensureRequiredDirs(next);

  if (existsSync(live)) renameSync(live, old);
  renameSync(next, live);
  rmSync(old, { recursive: true, force: true });
  return result;
}

/** Bring the live mirror up to date with `treePath` in place (used while watching). */
export function syncMirror(treePath: string, mirrorDir: string): SyncResult | undefined {
  const src = buildDir(treePath);
  // Build output is being cleaned/recreated: keep serving the previous files.
  if (!existsSync(src)) return undefined;
  const result = emptyResult();
  const live = mirrorBuildDir(mirrorDir);
  syncDir(src, live, result);
  ensureRequiredDirs(live);
  return result;
}

/**
 * Keep the mirror in sync with a tree's build output. Changes are debounced into a
 * full incremental sync, which also covers the build dir being deleted and recreated.
 */
export function watchMirror(
  treePath: string,
  mirrorDir: string,
  onSync: (result: SyncResult) => void,
  { debounceMs = 250, guard = () => true }: { debounceMs?: number; guard?: () => boolean } = {},
): () => void {
  const src = buildDir(treePath);
  let timer: ReturnType<typeof setTimeout> | undefined;
  let buildWatcher: FSWatcher | undefined;

  const flush = () => {
    timer = undefined;
    if (!guard()) return;
    const result = syncMirror(treePath, mirrorDir);
    if (result && (result.linked || result.removed)) onSync(result);
    attachBuildWatcher();
  };
  const schedule = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(flush, debounceMs);
  };

  const attachBuildWatcher = () => {
    if (buildWatcher || !existsSync(src)) return;
    try {
      buildWatcher = watch(src, { recursive: true }, schedule);
      buildWatcher.on("error", () => {
        buildWatcher?.close();
        buildWatcher = undefined;
        schedule();
      });
    } catch {
      buildWatcher = undefined;
    }
  };

  // Watch the tree root too, to notice hass_frontend being removed and recreated.
  const rootWatcher = watch(treePath, (_event, name) => {
    if (name !== "hass_frontend") return;
    buildWatcher?.close();
    buildWatcher = undefined;
    schedule();
  });

  attachBuildWatcher();
  schedule();

  return () => {
    if (timer) clearTimeout(timer);
    buildWatcher?.close();
    rootWatcher.close();
  };
}
