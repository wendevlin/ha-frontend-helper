import { defineCommand } from "citty";
import { HafError, loadConfig } from "../config";
import { switchMirror, watchMirror } from "../mirror";
import { p, pc, tildify } from "../ui";

export default defineCommand({
  meta: { name: "sync", description: "Re-mirror the active tree's build (e.g. after building it yourself)" },
  args: {
    watch: { type: "boolean", alias: "w", description: "Keep syncing on every rebuild" },
  },
  async run({ args }) {
    const config = loadConfig();
    if (!config.active) throw new HafError("No active tree. Run `haf use` first.");
    const tree = config.active;

    const result = switchMirror(tree, config.mirrorDir);
    p.log.success(`Mirrored ${result.files} files from ${tildify(tree)}`);
    if (!args.watch) return;

    p.log.step(`Watching ${tildify(tree)}/hass_frontend — Ctrl+C to stop`);
    watchMirror(tree, config.mirrorDir, (r) => {
      console.log(pc.dim(`[haf ${new Date().toLocaleTimeString()}] mirrored ${r.linked} changed, ${r.removed} removed`));
    });
    await new Promise(() => {});
  },
});
