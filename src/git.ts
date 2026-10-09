import { accessSync, constants, existsSync, statSync } from "node:fs";
import { basename, delimiter, join, resolve } from "node:path";
import { $, execa } from "execa";
import { HafError } from "./config";

export interface Tree {
  path: string;
  name: string;
  branch?: string;
  head: string;
  isMain: boolean;
  pr?: number;
  /** mtime of the built hass_frontend, if there is a build. */
  builtAt?: Date;
}

export interface PrInfo {
  number: number;
  title: string;
  headRefName: string;
  url: string;
  author: { login: string };
}

/** Run a command with inherited stdio; throws HafError on failure. */
export async function run(cmd: string[], cwd: string): Promise<void> {
  const [file, ...args] = cmd;
  const { exitCode } = await execa(file, args, { cwd, stdio: "inherit", reject: false });
  if (exitCode !== 0) throw new HafError(`\`${cmd.join(" ")}\` failed with exit code ${exitCode}`);
}

export function buildTime(treePath: string): Date | undefined {
  const index = join(treePath, "hass_frontend", "index.html");
  return existsSync(index) ? statSync(index).mtime : undefined;
}

export async function listTrees(repo: string): Promise<Tree[]> {
  const { stdout: out } = await $({ cwd: repo })`git worktree list --porcelain`;
  const trees: Tree[] = [];
  for (const block of out.trim().split("\n\n")) {
    const fields = new Map<string, string>();
    for (const line of block.split("\n")) {
      const i = line.indexOf(" ");
      fields.set(i === -1 ? line : line.slice(0, i), i === -1 ? "" : line.slice(i + 1));
    }
    const path = fields.get("worktree");
    if (!path || fields.has("bare") || fields.has("prunable")) continue;
    const branch = fields.get("branch")?.replace(/^refs\/heads\//, "");
    trees.push({
      path,
      name: basename(path),
      branch,
      head: (fields.get("HEAD") ?? "").slice(0, 10),
      isMain: trees.length === 0,
      builtAt: buildTime(path),
    });
  }
  await Promise.all(trees.map(async (t) => (t.pr = await prForTree(repo, t))));
  return trees;
}

async function prForTree(repo: string, tree: Tree): Promise<number | undefined> {
  if (tree.branch) {
    const { stdout: recorded } = await $({ cwd: repo, reject: false })`git config --get branch.${tree.branch}.haf-pr`;
    if (recorded) return Number(recorded);
    // gh pr checkout records the PR ref as the branch's merge target for fork PRs.
    const { stdout: merge } = await $({ cwd: repo, reject: false })`git config --get branch.${tree.branch}.merge`;
    const m = merge.match(/refs\/pull\/(\d+)\/head/);
    if (m) return Number(m[1]);
  }
  const m = tree.name.match(/^pr-(\d+)/);
  return m ? Number(m[1]) : undefined;
}

/** Find a tree by name, path or PR number. */
export function findTree(trees: Tree[], query: string): Tree | undefined {
  const abs = resolve(query);
  return (
    trees.find((t) => t.name === query || t.path === abs || t.branch === query) ??
    (/^\d+$/.test(query) ? trees.find((t) => t.pr === Number(query)) : undefined)
  );
}

export async function prView(repo: string, number: number): Promise<PrInfo> {
  const res = await $({ cwd: repo, reject: false })`gh pr view ${number} --json number,title,headRefName,url,author`;
  if (res.exitCode !== 0) {
    throw new HafError(`Could not load PR #${number}: ${res.stderr}`);
  }
  return JSON.parse(res.stdout) as PrInfo;
}

/** Remember which PR a checkout's branch belongs to (gh only records it for fork PRs). */
export async function recordPr(path: string, number: number): Promise<void> {
  const { stdout: branch } = await $({ cwd: path })`git branch --show-current`;
  if (branch) await $({ cwd: path })`git config branch.${branch}.haf-pr ${number}`;
}

export async function isDirty(path: string): Promise<boolean> {
  const { stdout } = await $({ cwd: path })`git status --porcelain --untracked-files=no`;
  return stdout.length > 0;
}

export async function assertTools(...tools: string[]): Promise<void> {
  for (const tool of tools) {
    if (!which(tool)) throw new HafError(`\`${tool}\` was not found on PATH.`);
  }
}

/** Absolute path of an executable on PATH, like `which`. */
export function which(bin: string): string | undefined {
  for (const dir of (process.env.PATH ?? "").split(delimiter)) {
    const file = join(dir, bin);
    try {
      accessSync(file, constants.X_OK);
      return file;
    } catch {}
  }
  return undefined;
}

export function slug(text: string, max = 40): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, max)
    .replace(/-+$/, "");
}
