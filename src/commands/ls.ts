import { defineCommand } from "citty";
import { loadConfig } from "../config";
import { fillPrTitles, listTrees } from "../git";
import { describeTree, treeTitle } from "../trees";
import { link, pc, tildify } from "../ui";

export default defineCommand({
  meta: { name: "ls", description: "List the main checkout and all worktrees" },
  args: {
    names: { type: "boolean", description: "Only print names (for scripts and completions)" },
  },
  async run({ args }) {
    const config = loadConfig();
    const trees = await listTrees(config.frontendRepo);
    if (args.names) {
      console.log(trees.map((t) => t.name).join("\n"));
      return;
    }
    await fillPrTitles(trees);
    for (const tree of trees) {
      const marker = tree.path === config.active ? pc.green("●") : " ";
      const author = tree.author ? pc.dim(` by ${tree.author}`) : "";
      const pr = tree.pr ? ` ${link(pc.dim("↗"), `https://github.com/home-assistant/frontend/pull/${tree.pr}`)}` : "";
      const name = tree.title ? `${tree.name} ${pc.dim("·")} ` : "";
      console.log(`${marker} ${treeTitle(tree)}${author}${pr}`);
      console.log(`    ${name}${describeTree(tree)}  ${pc.dim(tildify(tree.path))}`);
    }
  },
});
