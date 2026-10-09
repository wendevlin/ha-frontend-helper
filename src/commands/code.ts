import { defineCommand } from "citty";
import { loadConfig } from "../config";
import { openInVSCode } from "../editor";
import { pickTree } from "../trees";

export default defineCommand({
  meta: { name: "code", description: "Open a tree in a new VS Code window" },
  args: {
    tree: { type: "positional", required: false, description: "Tree name, branch or PR number" },
  },
  async run({ args }) {
    const config = loadConfig();
    const tree = await pickTree(config, args.tree, { message: "Open which tree in VS Code?" });
    await openInVSCode(tree.path);
  },
});
