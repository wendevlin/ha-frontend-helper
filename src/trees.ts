import { HafError, type Config } from "./config";
import { findTree, listTrees, type Tree } from "./git";
import { p, pc, relativeTime, tildify, unwrap } from "./ui";

export function describeTree(tree: Tree): string {
  const parts = [tree.branch ? pc.cyan(tree.branch) : pc.yellow(`detached ${tree.head}`)];
  if (tree.pr) parts.push(pc.magenta(`#${tree.pr}`));
  parts.push(tree.builtAt ? pc.green(`built ${relativeTime(tree.builtAt)}`) : pc.red("not built"));
  return parts.join(pc.dim(" · "));
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

  return unwrap(
    await p.select({
      message,
      initialValue: trees.find((t) => t.path === config.active) ?? trees[0],
      options: trees.map((tree) => ({
        value: tree,
        label: `${tree.path === config.active ? pc.green("●") : " "} ${tree.isMain ? `${tree.name} ${pc.dim("(main)")}` : tree.name}`,
        hint: `${describeTree(tree)} ${pc.dim(tildify(tree.path))}`,
      })),
    }),
  );
}
