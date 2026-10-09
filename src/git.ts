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
  /** PR title and author, recorded at checkout. */
  title?: string;
  author?: string;
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

  const pattern = String.raw`^branch\..*\.(haf-pr|haf-title|haf-author|merge)$`;
  const { stdout } = await $({ cwd: repo, reject: false })`git config --get-regexp ${pattern}`;
  const meta = parseBranchMeta(stdout);
  for (const tree of trees) {
    const vars = (tree.branch && meta.get(tree.branch)) || new Map<string, string>();
    tree.pr = prNumber(tree, vars);
    tree.title = vars.get("haf-title");
    tree.author = vars.get("haf-author");
  }
  return trees;
}

/** Parse `git config --get-regexp ^branch\.` output into branch → variable → value. */
export function parseBranchMeta(stdout: string): Map<string, Map<string, string>> {
  const meta = new Map<string, Map<string, string>>();
  for (const line of stdout.split("\n")) {
    const space = line.indexOf(" ");
    if (space === -1) continue;
    const key = line.slice(0, space);
    // Branch names may contain dots, variable names can't: split at the last one.
    const dot = key.lastIndexOf(".");
    const branch = key.slice("branch.".length, dot);
    if (!meta.has(branch)) meta.set(branch, new Map());
    meta.get(branch)?.set(key.slice(dot + 1), line.slice(space + 1));
  }
  return meta;
}

function prNumber(tree: Tree, vars: Map<string, string>): number | undefined {
  const recorded = vars.get("haf-pr");
  if (recorded) return Number(recorded);
  // gh pr checkout records the PR ref as the branch's merge target for fork PRs.
  const m = vars.get("merge")?.match(/refs\/pull\/(\d+)\/head/) ?? tree.name.match(/^pr-(\d+)/);
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

/** Remember which PR a checkout's branch belongs to (gh only records the number for fork PRs). */
export async function recordPr(path: string, pr: Pick<PrInfo, "number" | "title" | "author">): Promise<void> {
  const { stdout: branch } = await $({ cwd: path })`git branch --show-current`;
  if (!branch) return;
  await $({ cwd: path })`git config branch.${branch}.haf-pr ${pr.number}`;
  await $({ cwd: path })`git config branch.${branch}.haf-title ${pr.title}`;
  await $({ cwd: path })`git config branch.${branch}.haf-author ${pr.author.login}`;
}

/**
 * Look up and record titles for PR trees checked out before haf stored them.
 * Best effort: without gh or network the trees just stay untitled.
 */
export async function fillPrTitles(trees: Tree[]): Promise<void> {
  const missing = trees.filter((t) => t.pr && t.branch && !(t.title && t.author));
  if (missing.length === 0 || !which("gh")) return;
  const found = await Promise.all(
    missing.map(async (tree) => {
      const number = tree.pr as number;
      const res = await $({ cwd: tree.path, reject: false, timeout: 10_000 })`gh pr view ${number} --json title,author`;
      if (res.exitCode !== 0) return undefined;
      const { title, author } = JSON.parse(res.stdout) as Pick<PrInfo, "title" | "author">;
      tree.title = title;
      tree.author = author.login;
      return { tree, pr: { number, title, author } };
    }),
  );
  // Worktrees share one .git/config, so write one at a time to avoid its lock.
  for (const entry of found) {
    if (entry) await recordPr(entry.tree.path, entry.pr).catch(() => {});
  }
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
