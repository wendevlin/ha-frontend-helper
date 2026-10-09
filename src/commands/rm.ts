import { defineCommand } from "citty";
import { $ } from "execa";
import { loadConfig } from "../config";
import { isDirty, listTrees } from "../git";
import { pickTree } from "../trees";
import { confirm, p, pc, tildify } from "../ui";
import { activate } from "./use";

export default defineCommand({
  meta: { name: "rm", description: "Remove a worktree (and optionally its branch)" },
  args: {
    tree: { type: "positional", required: false, description: "Tree name, branch or PR number" },
    force: { type: "boolean", alias: "f", description: "Skip confirmations and discard local changes" },
  },
  async run({ args }) {
    const config = loadConfig();
    p.intro(pc.bgRed(pc.black(" haf rm ")));
    const tree = await pickTree(config, args.tree, { message: "Remove which worktree?", filter: (t) => !t.isMain });

    const dirty = await isDirty(tree.path);
    if (!args.force) {
      const message = dirty
        ? `${tree.name} has uncommitted changes. Remove it anyway?`
        : `Remove ${tree.name} (${tildify(tree.path)})?`;
      if (!(await confirm({ message, initialValue: !dirty }))) return p.cancel("Kept it.");
    }

    // Move core off this tree before its files disappear.
    if (config.active === tree.path) {
      const main = (await listTrees(config.frontendRepo))[0];
      activate(config, main);
    }

    await $({
      cwd: config.frontendRepo,
      stdio: "inherit",
    })`git worktree remove ${dirty || args.force ? ["--force"] : []} ${tree.path}`;
    p.log.success(`Removed ${tree.name}`);

    if (tree.branch) {
      const del = args.force || (await confirm({ message: `Delete branch ${pc.cyan(tree.branch)} too?` }));
      if (del) {
        await $({ cwd: config.frontendRepo })`git branch -D ${tree.branch}`;
        p.log.success(`Deleted branch ${tree.branch}`);
      }
    }
    p.outro("Done.");
  },
});
