import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const configurationYaml = (coreConfigDir: string) => join(coreConfigDir, "configuration.yaml");

export function coreSnippet(mirrorDir: string): string {
  return `frontend:\n  development_repo: ${mirrorDir}`;
}

/** Current development_repo value in a configuration.yaml, if any. */
export function readDevelopmentRepo(coreConfigDir: string): string | undefined {
  const file = configurationYaml(coreConfigDir);
  if (!existsSync(file)) return undefined;
  return readFileSync(file, "utf8").match(/^\s+development_repo:\s*(.+?)\s*$/m)?.[1];
}

/**
 * Point core's `frontend:` block at the mirror dir, adding `development_repo`
 * (or the whole block) when missing. Returns false if nothing changed.
 */
export function patchConfigurationYaml(coreConfigDir: string, mirrorDir: string): boolean {
  const file = configurationYaml(coreConfigDir);
  const yaml = readFileSync(file, "utf8");
  const lines = yaml.split("\n");
  const start = lines.findIndex((l) => /^frontend:\s*(#.*)?$/.test(l));

  let next: string;
  if (start === -1) {
    next = `${yaml.trimEnd()}\n\n${coreSnippet(mirrorDir)}\n`;
  } else {
    let end = start + 1;
    while (end < lines.length && (lines[end].trim() === "" || /^\s/.test(lines[end]))) end++;
    const block = lines.slice(start + 1, end);
    const existing = block.findIndex((l) => /^\s+development_repo:/.test(l));
    if (existing !== -1) {
      block[existing] = block[existing].replace(/development_repo:.*/, `development_repo: ${mirrorDir}`);
    } else {
      const indent = block.find((l) => l.trim())?.match(/^\s+/)?.[0] ?? "  ";
      block.unshift(`${indent}development_repo: ${mirrorDir}`);
    }
    next = [...lines.slice(0, start + 1), ...block, ...lines.slice(end)].join("\n");
  }

  if (next === yaml) return false;
  writeFileSync(file, next);
  return true;
}
