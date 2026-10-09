import { type Config, HafError } from "./config";
import { fillPrTitles, findTree, listTrees, type Tree } from "./git";
import { p, pc, relativeTime, tildify, truncate, unwrap } from "./ui";

export function describeTree(tree: Tree): string {
  const parts = [tree.branch ? pc.cyan(tree.branch) : pc.yellow(`detached ${tree.head}`)];
  // With a title, the PR number is already shown next to it (see treeTitle).
  if (tree.pr && !tree.title) parts.push(pc.magenta(`#${tree.pr}`));
  parts.push(buildState(tree));
  return parts.join(pc.dim(" · "));
}

function buildState(tree: Tree): string {
  return tree.builtAt ? pc.green(`built ${relativeTime(tree.builtAt)}`) : pc.red("not built");
}

/** What a tree is about: "#123 PR title" when known, else its directory name. */
export function treeTitle(tree: Tree, max = 80): string {
  if (tree.isMain) return `${pc.bold(tree.name)} ${pc.dim("(main)")}`;
  if (tree.pr && tree.title) return `${pc.magenta(`#${tree.pr}`)} ${pc.bold(truncate(tree.title, max))}`;
  return pc.bold(tree.name);
}

/** Resolve a tree from a query, or ask interactively. */
export async function pickTree(
  config: Config,
  query: string | undefined,
  { message, filter }: { message: string; filter?: (t: Tree) => boolean },
): Promise<Tree> {
  const trees = (await listTrees(config.frontendRepo)).filter(filter ?? (() => true));
  if (query) {
    const tree = findTree(trees, query);
    if (!tree) throw new HafError(`No tree matches "${query}". Run \`haf ls\` to see all trees.`);
    return tree;
  }
  if (trees.length === 0) throw new HafError("No trees to choose from.");
  await fillPrTitles(trees);

  return unwrap(
    await p.select({
      message,
      initialValue: trees.find((t) => t.path === config.active) ?? trees[0],
      options: trees.map((tree) => ({
        value: tree,
        label: `${tree.path === config.active ? pc.green("●") : " "} ${treeTitle(tree, 70)}`,
        // The title already says what it is; keep the hint short enough not to wrap.
        hint: tree.title ? `${tree.name} · ${buildState(tree)}` : `${describeTree(tree)} ${pc.dim(tildify(tree.path))}`,
      })),
    }),
  );
}
