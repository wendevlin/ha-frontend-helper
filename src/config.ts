import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export interface Config {
  /** Main checkout of home-assistant/frontend. */
  frontendRepo: string;
  /** Where `prc --tree` creates worktrees. */
  treesDir: string;
  /** Stable dir core's `development_repo` points at. */
  mirrorDir: string;
  /** Path of the tree currently mirrored. */
  active?: string;
  /** Core config dir (contains configuration.yaml), if known. */
  coreConfigDir?: string;
}

const xdg = (env: string, fallback: string) => process.env[env] || join(homedir(), fallback);

export const CONFIG_PATH = join(xdg("XDG_CONFIG_HOME", ".config"), "haf", "config.json");
export const DEFAULT_MIRROR_DIR = join(xdg("XDG_DATA_HOME", ".local/share"), "haf", "frontend");

export function configExists(): boolean {
  return existsSync(CONFIG_PATH);
}

export function loadConfig(): Config {
  if (!configExists()) {
    throw new HafError("haf is not initialized yet. Run `haf init` first.");
  }
  return JSON.parse(readFileSync(CONFIG_PATH, "utf8")) as Config;
}

export function saveConfig(config: Config): void {
  mkdirSync(dirname(CONFIG_PATH), { recursive: true });
  writeFileSync(CONFIG_PATH, `${JSON.stringify(config, null, 2)}\n`);
}

export function updateConfig(patch: Partial<Config>): Config {
  const config = { ...loadConfig(), ...patch };
  saveConfig(config);
  return config;
}

/** Errors that should be shown to the user without a stack trace. */
export class HafError extends Error {}
