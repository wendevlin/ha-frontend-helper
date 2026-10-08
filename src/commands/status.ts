import { defineCommand } from "citty";
import { CONFIG_PATH, loadConfig } from "../config";
import { configurationYaml, coreSnippet, readDevelopmentRepo } from "../core";
import { listTrees } from "../git";
import { describeTree } from "../trees";
import { p, pc, tildify } from "../ui";

export default defineCommand({
  meta: { name: "status", description: "Show the active frontend and core setup" },
  async run() {
    const config = loadConfig();
    const trees = await listTrees(config.frontendRepo);
    const active = trees.find((t) => t.path === config.active);

    p.intro(pc.bgCyan(pc.black(" haf status ")));
    p.log.info(
      active
        ? `Active: ${pc.bold(active.name)}  ${describeTree(active)}\n${pc.dim(tildify(active.path))}`
        : pc.yellow("No active tree — run `haf use`."),
    );
    p.log.message(
      [
        `Frontend repo   ${tildify(config.frontendRepo)}`,
        `Worktrees       ${tildify(config.treesDir)} ${pc.dim(`(${trees.length - 1})`)}`,
        `Core serves     ${tildify(config.mirrorDir)}`,
        `Config          ${tildify(CONFIG_PATH)}`,
      ].join("\n"),
    );

    if (config.coreConfigDir) {
      const current = readDevelopmentRepo(config.coreConfigDir);
      if (current === config.mirrorDir) {
        p.log.success(`${tildify(configurationYaml(config.coreConfigDir))} points at the mirror`);
      } else {
        p.log.warn(
          `${tildify(configurationYaml(config.coreConfigDir))} has development_repo: ${current ?? "(not set)"}`,
        );
        p.note(coreSnippet(config.mirrorDir), "Expected");
      }
    } else {
      p.note(coreSnippet(config.mirrorDir), "Core needs");
    }
    p.outro("");
  },
});
