import { defineCommand } from "citty";
import { loadConfig } from "../config";
import { listTrees } from "../git";
import { describeTree } from "../trees";
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
    const width = Math.max(...trees.map((t) => t.name.length));
    for (const tree of trees) {
      const marker = tree.path === config.active ? pc.green("●") : " ";
      const name = tree.name.padEnd(width);
      const pr = tree.pr ? ` ${link(pc.dim("↗"), `https://github.com/home-assistant/frontend/pull/${tree.pr}`)}` : "";
      console.log(`${marker} ${pc.bold(name)}  ${describeTree(tree)}${pr}  ${pc.dim(tildify(tree.path))}`);
    }
  },
});
