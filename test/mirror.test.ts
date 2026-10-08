import { afterEach, beforeEach, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { switchMirror, syncMirror, watchMirror } from "../src/mirror";

let root: string;
const tree = (name: string) => join(root, name);
const mirror = () => join(root, "mirror");
const live = (...p: string[]) => join(mirror(), "hass_frontend", ...p);

function writeBuild(name: string, files: Record<string, string>) {
  for (const [rel, content] of Object.entries(files)) {
    const path = join(tree(name), "hass_frontend", rel);
    mkdirSync(join(path, ".."), { recursive: true });
    writeFileSync(path, content);
  }
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "haf-test-"));
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

test("switchMirror hardlinks files and creates required dirs", () => {
  writeBuild("a", { "index.html": "A", "frontend_latest/app.js": "a-app" });
  const result = switchMirror(tree("a"), mirror());

  expect(result.files).toBe(2);
  expect(readFileSync(live("index.html"), "utf8")).toBe("A");
  expect(statSync(live("frontend_latest/app.js")).ino).toBe(
    statSync(join(tree("a"), "hass_frontend/frontend_latest/app.js")).ino,
  );
  expect(existsSync(live("frontend_es5"))).toBe(true);
  expect(existsSync(live("static"))).toBe(true);
});

test("switching trees replaces content and drops stale files", () => {
  writeBuild("a", { "index.html": "A", "frontend_latest/only-a.js": "x" });
  writeBuild("b", { "index.html": "B", "frontend_latest/only-b.js": "y" });
  switchMirror(tree("a"), mirror());
  switchMirror(tree("b"), mirror());

  expect(readFileSync(live("index.html"), "utf8")).toBe("B");
  expect(existsSync(live("frontend_latest/only-a.js"))).toBe(false);
  expect(existsSync(live("frontend_latest/only-b.js"))).toBe(true);
  expect(existsSync(`${live()}.next`)).toBe(false);
  expect(existsSync(`${live()}.old`)).toBe(false);
});

test("syncMirror relinks files replaced by rename-writes and skips unchanged", () => {
  writeBuild("a", { "index.html": "A", "frontend_latest/app.js": "v1" });
  switchMirror(tree("a"), mirror());

  const app = join(tree("a"), "hass_frontend/frontend_latest/app.js");
  rmSync(app);
  writeFileSync(app, "v2");
  const result = syncMirror(tree("a"), mirror())!;

  expect(result.linked).toBe(1);
  expect(readFileSync(live("frontend_latest/app.js"), "utf8")).toBe("v2");
});

test("syncMirror keeps serving old files while the build dir is missing", () => {
  writeBuild("a", { "index.html": "A" });
  switchMirror(tree("a"), mirror());
  rmSync(join(tree("a"), "hass_frontend"), { recursive: true });

  expect(syncMirror(tree("a"), mirror())).toBeUndefined();
  expect(readFileSync(live("index.html"), "utf8")).toBe("A");
});

test("watchMirror picks up new files", async () => {
  writeBuild("a", { "index.html": "A" });
  switchMirror(tree("a"), mirror());

  const synced = new Promise<void>((resolve) => {
    const stop = watchMirror(tree("a"), mirror(), () => {
      if (existsSync(live("frontend_latest/new-chunk.js"))) {
        stop();
        resolve();
      }
    }, { debounceMs: 50 });
  });
  await Bun.sleep(100);
  writeBuild("a", { "frontend_latest/new-chunk.js": "chunk" });
  await synced;
  expect(readFileSync(live("frontend_latest/new-chunk.js"), "utf8")).toBe("chunk");
});

test("watchMirror survives the build dir being deleted and recreated", async () => {
  writeBuild("a", { "index.html": "old" });
  switchMirror(tree("a"), mirror());

  const synced = new Promise<void>((resolve) => {
    const stop = watchMirror(tree("a"), mirror(), () => {
      if (readFileSync(live("index.html"), "utf8") === "new" && existsSync(live("frontend_latest/app.js"))) {
        stop();
        resolve();
      }
    }, { debounceMs: 50 });
  });
  await Bun.sleep(100);
  rmSync(join(tree("a"), "hass_frontend"), { recursive: true });
  await Bun.sleep(100);
  writeBuild("a", { "index.html": "new" });
  await Bun.sleep(100);
  writeBuild("a", { "frontend_latest/app.js": "app" });
  await synced;
});

test("watchMirror pauses when the guard says the tree is no longer active", async () => {
  writeBuild("a", { "index.html": "A" });
  switchMirror(tree("a"), mirror());
  const stop = watchMirror(tree("a"), mirror(), () => {}, { debounceMs: 20, guard: () => false });
  await Bun.sleep(50);
  writeBuild("a", { "frontend_latest/new.js": "x" });
  await Bun.sleep(150);
  stop();
  expect(existsSync(live("frontend_latest/new.js"))).toBe(false);
});
