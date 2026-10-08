import { defineCommand } from "citty";
import { loadConfig } from "../config";
import { pickTree } from "../trees";

export default defineCommand({
  meta: { name: "path", description: "Print a tree's path, e.g. cd \"$(haf path 12345)\"" },
  args: {
    tree: { type: "positional", required: false, description: "Tree name, branch or PR number (default: active)" },
  },
  async run({ args }) {
    const config = loadConfig();
    const tree = await pickTree(config, args.tree ?? config.active, { message: "Which tree?" });
    console.log(tree.path);
  },
});
