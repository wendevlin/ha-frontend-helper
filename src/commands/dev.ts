import { existsSync } from "node:fs";
import { join } from "node:path";
import { defineCommand } from "citty";
import { execa } from "execa";
import { type Config, loadConfig, updateConfig } from "../config";
import { run, type Tree } from "../git";
import { switchMirror, watchMirror } from "../mirror";
import { pickTree } from "../trees";
import { confirm, p, pc, setTitle } from "../ui";

/** Run script/develop in a tree while mirroring its output into core's dev repo. */
export async function runDev(config: Config, tree: Tree): Promise<never> {
  if (config.active !== tree.path) {
    switchMirror(tree.path, config.mirrorDir);
    config = updateConfig({ active: tree.path });
  }

  if (!existsSync(join(tree.path, "node_modules"))) {
    const install = await confirm({ message: "No node_modules here yet. Run script/setup first?" });
    if (install) await run(["script/setup"], tree.path);
  }

  setTitle(`haf dev · ${tree.name}`);
  p.log.step(`Building ${pc.bold(tree.name)} with script/develop — refresh your browser after rebuilds.`);

  let warned = false;
  const stop = watchMirror(
    tree.path,
    config.mirrorDir,
    (result) => {
      const time = new Date().toLocaleTimeString();
      console.log(pc.dim(`[haf ${time}] mirrored ${result.linked} changed, ${result.removed} removed`));
    },
    {
      // Another `haf use` took over: stop mirroring this tree.
      guard: () => {
        const active = loadConfig().active === tree.path;
        if (!active && !warned) {
          warned = true;
          console.log(pc.yellow(`[haf] ${tree.name} is no longer active, mirroring paused.`));
        }
        if (active) warned = false;
        return active;
      },
    },
  );

  const proc = execa("script/develop", { cwd: tree.path, stdio: "inherit", reject: false });
  // Ctrl+C reaches script/develop through the process group; just wait for it.
  process.on("SIGINT", () => {});
  const { exitCode } = await proc;
  stop();
  setTitle("");
  process.exit(exitCode ?? 1);
}

export default defineCommand({
  meta: { name: "dev", description: "Run script/develop and keep core's frontend in sync with it" },
  args: {
    tree: { type: "positional", required: false, description: "Tree to develop (defaults to the active one)" },
  },
  async run({ args }) {
    const config = loadConfig();
    const tree = await pickTree(config, args.tree ?? config.active, { message: "Which tree?" });
    await runDev(config, tree);
  },
});
