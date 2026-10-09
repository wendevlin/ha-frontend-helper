import { existsSync, mkdirSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { defineCommand } from "citty";
import { $ } from "execa";
import {
  CONFIG_PATH,
  type Config,
  configExists,
  DEFAULT_MIRROR_DIR,
  HafError,
  loadConfig,
  saveConfig,
} from "../config";
import { configurationYaml, coreSnippet, patchConfigurationYaml } from "../core";
import { listTrees } from "../git";
import { p, pc, tildify, unwrap } from "../ui";
import { activate } from "./use";

const expand = (path: string) => resolve(path.replace(/^~(?=$|\/)/, homedir()));

function isFrontendRepo(path: string): boolean {
  try {
    return JSON.parse(readFileSync(join(path, "package.json"), "utf8")).name === "home-assistant-frontend";
  } catch {
    return false;
  }
}

/** The main checkout for a path inside any frontend worktree. */
async function mainCheckout(path: string): Promise<string | undefined> {
  const res = await $({ cwd: path, reject: false })`git rev-parse --path-format=absolute --git-common-dir`;
  if (res.exitCode !== 0) return undefined;
  const main = dirname(res.stdout);
  return isFrontendRepo(main) ? main : undefined;
}

function guessCoreConfigDir(frontendRepo: string): string | undefined {
  const guess = join(dirname(frontendRepo), "core", "config");
  return existsSync(configurationYaml(guess)) ? guess : undefined;
}

export default defineCommand({
  meta: { name: "init", description: "Set up haf and the development_repo path for core" },
  async run() {
    p.intro(pc.bgCyan(pc.black(" haf init ")));
    const previous: Partial<Config> = configExists() ? loadConfig() : {};

    const detected = (await mainCheckout(process.cwd())) ?? previous.frontendRepo;
    const frontendRepo = expand(
      unwrap(
        await p.text({
          message: "Where is your home-assistant/frontend checkout?",
          initialValue: detected ? tildify(detected) : "",
          placeholder: "~/code/home-assistant/frontend",
          validate: (v) => (v && isFrontendRepo(expand(v)) ? undefined : "Not a home-assistant/frontend checkout"),
        }),
      ),
    );

    const treesDir = expand(
      unwrap(
        await p.text({
          message: "Where should PR worktrees go?",
          initialValue: tildify(previous.treesDir ?? join(dirname(frontendRepo), "frontend-trees")),
        }),
      ),
    );

    // Hardlinks need the mirror on the same filesystem as the trees.
    let mirrorDefault = previous.mirrorDir ?? DEFAULT_MIRROR_DIR;
    mkdirSync(dirname(mirrorDefault), { recursive: true });
    if (statSync(dirname(mirrorDefault)).dev !== statSync(frontendRepo).dev) {
      mirrorDefault = join(dirname(frontendRepo), ".haf-frontend");
    }
    const mirrorDir = expand(
      unwrap(
        await p.text({
          message: "Stable frontend path for core (development_repo)",
          initialValue: tildify(mirrorDefault),
        }),
      ),
    );
    mkdirSync(mirrorDir, { recursive: true });

    const coreGuess = previous.coreConfigDir ?? guessCoreConfigDir(frontendRepo);
    const coreInput = unwrap(
      await p.text({
        message: "Core config dir (with configuration.yaml) — leave empty to skip",
        initialValue: coreGuess ? tildify(coreGuess) : "",
        validate: (v) =>
          !v || existsSync(configurationYaml(expand(v))) ? undefined : "No configuration.yaml in that directory",
      }),
    );
    const coreConfigDir = coreInput ? expand(coreInput) : undefined;

    const config: Config = { frontendRepo, treesDir, mirrorDir, coreConfigDir, active: previous.active };
    saveConfig(config);

    // Fill the mirror before core starts: core skips static dirs that don't exist yet.
    const trees = await listTrees(frontendRepo);
    const active = trees.find((t) => t.path === config.active) ?? trees[0];
    if (!active) throw new HafError("Could not list worktrees of the frontend repo.");
    activate(config, active);

    let patched = false;
    if (coreConfigDir) {
      const ok = unwrap(
        await p.confirm({ message: `Add development_repo to ${tildify(configurationYaml(coreConfigDir))}?` }),
      );
      if (ok) patched = patchConfigurationYaml(coreConfigDir, mirrorDir) || true;
    }

    if (!patched) {
      p.note(coreSnippet(mirrorDir), "Add this to core's configuration.yaml");
    }
    p.log.info(`Config saved to ${pc.dim(tildify(CONFIG_PATH))}`);
    p.outro(
      `Restart core ${pc.bold("once")} to pick up the path. After that, ${pc.cyan("haf use")} switches frontends without restarts.`,
    );
  },
});
