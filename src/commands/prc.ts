import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { defineCommand } from "citty";
import { $ } from "execa";
import { type Choice, type Config, fromChoice, HafError, loadConfig, type PrcDefaults, updateConfig } from "../config";
import { codeCli, inVSCode, openInVSCode } from "../editor";
import { assertTools, isDirty, listTrees, type PrInfo, prView, recordPr, run, slug, type Tree } from "../git";
import { describeTree } from "../trees";
import { confirm, link, p, pc, tildify, unwrap } from "../ui";
import { useTree } from "./use";

interface PrcArgs {
  number: number;
  /** undefined: no worktree; "": worktree with generated name; else worktree name. */
  tree?: string;
}

/**
 * `--tree` takes an optional value, which flag parsers can't express, so parse it by
 * hand: `prc 123 --tree`, `prc 123 --tree name`, `prc --tree=name 123`, `prc -t 123`.
 */
export function parsePrcArgs(raw: string[]): PrcArgs {
  const positionals: string[] = [];
  let tree: string | undefined;
  let treeValueIndex = -1;

  for (let i = 0; i < raw.length; i++) {
    const arg = raw[i];
    if (arg === "--tree" || arg === "-t") {
      tree = "";
      const next = raw[i + 1];
      if (next !== undefined && !next.startsWith("-")) treeValueIndex = positionals.length;
    } else if (arg.startsWith("--tree=")) {
      tree = arg.slice("--tree=".length);
    } else if (!arg.startsWith("-")) {
      positionals.push(arg);
    }
  }

  // The token after a bare --tree is its name, unless we'd lose the PR number.
  if (treeValueIndex !== -1 && positionals.length > 1) {
    tree = positionals.splice(treeValueIndex, 1)[0];
  }

  const number = Number(positionals[0]?.replace(/^#/, ""));
  if (!Number.isInteger(number) || number <= 0) {
    throw new HafError("Usage: haf prc <pr-number> [--tree [name]]");
  }
  return { number, tree };
}

async function checkoutInMain(config: Config, pr: PrInfo): Promise<string> {
  if (await isDirty(config.frontendRepo)) {
    const go = await confirm({
      message: "The main checkout has uncommitted changes. Check out anyway?",
      initialValue: false,
    });
    if (!go) process.exit(1);
  }
  await run(["gh", "pr", "checkout", String(pr.number)], config.frontendRepo);
  return config.frontendRepo;
}

async function checkoutInTree(config: Config, pr: PrInfo, name: string): Promise<string> {
  const path = join(config.treesDir, name);
  if (existsSync(path)) throw new HafError(`${tildify(path)} already exists. Pick another name with --tree <name>.`);

  mkdirSync(config.treesDir, { recursive: true });
  await run(["git", "worktree", "add", "--detach", path], config.frontendRepo);
  try {
    const res = await $({ cwd: path, stdio: "inherit", reject: false })`gh pr checkout ${pr.number}`;
    if (res.exitCode !== 0) {
      // Usually the PR branch name is already checked out in another tree (e.g. a fork's "dev").
      p.log.warn(`Retrying with a dedicated branch name pr-${pr.number}`);
      await run(["gh", "pr", "checkout", String(pr.number), "--branch", `pr-${pr.number}`], path);
    }
  } catch (err) {
    await $({ cwd: config.frontendRepo, reject: false })`git worktree remove --force ${path}`;
    throw err;
  }
  return path;
}

const DEFAULT_STEPS: { key: keyof PrcDefaults; message: string }[] = [
  { key: "install", message: "Install dependencies (script/setup)?" },
  { key: "code", message: "Open new worktrees in a new VS Code window?" },
  { key: "use", message: "Switch core to the checkout?" },
  { key: "dev", message: "Start `haf dev` when the checkout has no build yet?" },
];

async function setDefaults(config: Config): Promise<void> {
  if (!process.stdin.isTTY) throw new HafError("--set-defaults is interactive; run it in a terminal.");
  p.intro(pc.bgMagenta(pc.black(" haf prc --set-defaults ")));
  const defaults: PrcDefaults = {};
  for (const { key, message } of DEFAULT_STEPS) {
    defaults[key] = unwrap(
      await p.select<Choice>({
        message,
        initialValue: config.prc?.[key] ?? "ask",
        options: [
          { value: "ask", label: "Ask" },
          { value: "always", label: "Always" },
          { value: "never", label: "Never" },
        ],
      }),
    );
  }
  updateConfig({ prc: defaults });
  p.outro(`Saved. Flags like ${pc.cyan("--no-install")} still override these per run.`);
}

export default defineCommand({
  meta: { name: "prc", description: "Check out a pull request, optionally into its own worktree" },
  args: {
    number: { type: "positional", required: false, description: "PR number" },
    tree: { type: "string", alias: "t", valueHint: "name", description: "Check out into a worktree (name optional)" },
    install: { type: "boolean", description: "Run script/setup afterwards (--no-install to skip)" },
    use: { type: "boolean", description: "Switch core to the checkout afterwards" },
    code: { type: "boolean", description: "Open a new worktree in a new VS Code window (--no-code to skip)" },
    dev: { type: "boolean", description: "Start `haf dev` if the checkout has no build (--no-dev to skip)" },
    "set-defaults": { type: "boolean", description: "Choose which steps to always/never do instead of asking" },
  },
  async run({ args, rawArgs }) {
    const config = loadConfig();
    if (args["set-defaults"]) return setDefaults(config);
    await assertTools("git", "gh");
    const defaults = config.prc ?? {};
    const { number, tree } = parsePrcArgs(rawArgs);

    p.intro(pc.bgMagenta(pc.black(" haf prc ")));
    const spin = p.spinner();
    spin.start(`Loading PR #${number}`);
    const pr = await prView(config.frontendRepo, number).finally(() => spin.stop(`PR #${number}`));
    p.log.info(`${link(pc.bold(pr.title), pr.url)}\n${pc.dim(`by ${pr.author.login} · ${pr.headRefName}`)}`);

    let path: string;
    if (tree === undefined) {
      path = await checkoutInMain(config, pr);
    } else {
      const existing = (await listTrees(config.frontendRepo)).find(
        (t) => !t.isMain && (t.pr === number || t.branch === pr.headRefName),
      );
      if (existing) {
        p.log.info(`PR #${number} already has a worktree: ${pc.bold(existing.name)} ${pc.dim(tildify(existing.path))}`);
        await $({ cwd: existing.path, stdio: "inherit", reject: false })`gh pr checkout ${number}`;
        path = existing.path;
      } else {
        path = await checkoutInTree(config, pr, tree || `pr-${number}-${slug(pr.headRefName)}`);
      }
    }
    await recordPr(path, pr);
    p.log.success(`Checked out at ${link(tildify(path), `file://${path}`)}`);

    const install =
      args.install ??
      fromChoice(defaults.install) ??
      (await confirm({ message: "Install dependencies (script/setup)?", initialValue: path !== config.frontendRepo }));
    if (install) await run(["script/setup"], path);

    const target: Tree | undefined = (await listTrees(config.frontendRepo)).find((t) => t.path === path);
    if (!target) throw new HafError(`Could not find the worktree at ${path}`);
    p.log.message(describeTree(target));

    // Only worktrees: the main checkout is usually the window you're already in.
    const code =
      args.code ??
      (!target.isMain &&
        (fromChoice(defaults.code) ??
          (inVSCode() && (await confirm({ message: "Open it in a new VS Code window?" })))));
    if (code && !args.code && !codeCli()) p.log.warn("Not opening VS Code: the `code` command is not on your PATH.");
    else if (code) await openInVSCode(path);

    const use =
      args.use ?? fromChoice(defaults.use) ?? (await confirm({ message: "Switch core to this frontend now?" }));
    if (use) return useTree(config, target, { dev: args.dev ?? fromChoice(defaults.dev) });
    p.outro(path === config.frontendRepo ? "Done." : `Done. ${pc.dim(`cd ${tildify(path)}`)}`);
  },
});
