import { defineCommand } from "citty";
import { type Config, loadConfig, updateConfig } from "../config";
import type { Tree } from "../git";
import { switchMirror } from "../mirror";
import { pickTree } from "../trees";
import { confirm, p, pc } from "../ui";
import { runDev } from "./dev";

/** Mirror a tree's build into core's development_repo and mark it active. */
export function activate(config: Config, tree: Tree): Config {
  const spin = p.spinner();
  spin.start(`Switching to ${tree.name}`);
  const result = switchMirror(tree.path, config.mirrorDir);
  spin.stop(
    `Switched to ${pc.bold(tree.name)} ${pc.dim(`(${result.files} files${result.copied ? ", copied" : ", hardlinked"})`)}`,
  );
  if (result.copied) {
    p.log.warn("Tree and mirror are on different filesystems, so files were copied instead of hardlinked.");
  }
  return updateConfig({ active: tree.path });
}

/** Switch to a tree, offering to start a dev build when it has none. */
export async function useTree(config: Config, tree: Tree): Promise<void> {
  config = activate(config, tree);
  if (tree.builtAt) {
    p.outro(`Refresh your browser ${pc.dim("— no core restart needed")}`);
    return;
  }
  p.log.warn(`${tree.name} has no build yet, so the frontend will be empty until it is built.`);
  const dev = await confirm({ message: "Start `haf dev` (script/develop) for it now?" });
  if (dev) await runDev(config, tree);
  else p.outro(`Run ${pc.cyan("haf dev")} when you're ready to build it.`);
}

export default defineCommand({
  meta: { name: "use", description: "Switch the frontend served by core (no restart needed)" },
  args: {
    tree: { type: "positional", required: false, description: "Tree name, branch or PR number" },
  },
  async run({ args }) {
    const config = loadConfig();
    p.intro(pc.bgCyan(pc.black(" haf use ")));
    const tree = await pickTree(config, args.tree, { message: "Which frontend should core serve?" });
    await useTree(config, tree);
  },
});
