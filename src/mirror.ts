import {
  copyFileSync,
  existsSync,
  type FSWatcher,
  linkSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  unlinkSync,
  watch,
  writeFileSync,
} from "node:fs";
import { basename, join } from "node:path";

/**
 * Core skips registering static dirs that don't exist at startup, so keep these
 * present in the mirror even if the active build lacks them (e.g. no es5 build).
 */
const REQUIRED_DIRS = ["static", "frontend_latest", "frontend_es5"];

/** Marks the placeholder index.html so syncs leave it alone until a real one exists. */
const PLACEHOLDER_MARKER = "<!-- haf-placeholder -->";

/**
 * Served while the active tree has no index.html (not built yet, or mid-build), so
 * core shows what to do instead of a 500. It reloads itself until the build lands.
 * Core renders index.html as a Jinja template, so keep it free of {{ and {%.
 */
function placeholderHtml(treeName: string): string {
  return `${PLACEHOLDER_MARKER}
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="refresh" content="5">
<title>Waiting for ${treeName} to build</title>
<style>
  body { font: 16px/1.5 system-ui, sans-serif; margin: 0; min-height: 100vh; display: grid; place-items: center;
         background: #111; color: #e1e1e1; }
  main { max-width: 34rem; padding: 2rem; }
  h1 { font-size: 1.4rem; margin: 0 0 .5rem; }
  code { background: #2a2a2a; padding: .15em .4em; border-radius: 4px; }
  p.dim { color: #9a9a9a; font-size: .9rem; }
</style>
</head>
<body>
<main>
  <h1>Waiting for ${treeName} to build</h1>
  <p>Core is switched to this frontend, but it has no build yet. If <code>haf dev</code> isn't running, start it in that tree:</p>
  <p><code>haf dev</code></p>
  <p class="dim">This page reloads every 5 seconds and turns into the real frontend once the first build is done. No core restart needed.</p>
</main>
</body>
</html>
`;
}

function isPlaceholder(path: string): boolean {
  try {
    return readFileSync(path, "utf8").startsWith(PLACEHOLDER_MARKER);
  } catch {
    return false;
  }
}

/** Write the placeholder when there is no index.html; returns whether one is being served. */
function ensureIndex(dir: string, treeName: string): boolean {
  const index = join(dir, "index.html");
  if (existsSync(index)) return isPlaceholder(index);
  writeFileSync(index, placeholderHtml(treeName));
  return true;
}

export interface SyncResult {
  files: number;
  linked: number;
  removed: number;
  copied: boolean;
  /** The tree has no index.html yet, so core shows the haf placeholder page. */
  placeholder: boolean;
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
function syncDir(src: string, dst: string, result: SyncResult, top = true): void {
  mkdirSync(dst, { recursive: true });
  const seen = new Set<string>();

  for (const entry of readdirSync(src, { withFileTypes: true })) {
    seen.add(entry.name);
    const s = join(src, entry.name);
    const d = join(dst, entry.name);
    const dstStat = lstatSync(d, { throwIfNoEntry: false });

    if (entry.isDirectory()) {
      if (dstStat && !dstStat.isDirectory()) unlinkSync(d);
      syncDir(s, d, result, false);
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
    if (seen.has(name)) continue;
    const path = join(dst, name);
    if (top && name === "index.html" && isPlaceholder(path)) continue;
    // Required dirs must survive (see REQUIRED_DIRS), but not with stale files in them.
    const entries = top && REQUIRED_DIRS.includes(name) ? readdirSync(path).map((e) => join(path, e)) : [path];
    for (const entry of entries) {
      rmSync(entry, { recursive: true, force: true });
      result.removed++;
    }
  }
}

function ensureRequiredDirs(dir: string): void {
  for (const name of REQUIRED_DIRS) mkdirSync(join(dir, name), { recursive: true });
}

function emptyResult(): SyncResult {
  return { files: 0, linked: 0, removed: 0, copied: false, placeholder: false };
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
  result.placeholder = ensureIndex(next, basename(treePath));

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
  result.placeholder = ensureIndex(live, basename(treePath));
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
