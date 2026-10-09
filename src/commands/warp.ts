import { mkdirSync, writeFileSync } from "node:fs";
import { homedir, platform } from "node:os";
import { join } from "node:path";
import { defineCommand } from "citty";
import { p, pc, tildify } from "../ui";

interface Workflow {
  file: string;
  name: string;
  command: string;
  description: string;
  arguments?: { name: string; description: string; default_value?: string }[];
}

const WORKFLOWS: Workflow[] = [
  {
    file: "haf-prc-tree",
    name: "haf: check out PR in a worktree",
    command: "haf prc {{pr}} --tree",
    description: "Check out a home-assistant/frontend PR into its own worktree",
    arguments: [{ name: "pr", description: "Pull request number" }],
  },
  {
    file: "haf-prc",
    name: "haf: check out PR",
    command: "haf prc {{pr}}",
    description: "Check out a home-assistant/frontend PR in the main checkout",
    arguments: [{ name: "pr", description: "Pull request number" }],
  },
  {
    file: "haf-use",
    name: "haf: switch frontend",
    command: "haf use",
    description: "Pick which frontend tree core serves (no restart)",
  },
  {
    file: "haf-dev",
    name: "haf: develop active frontend",
    command: "haf dev",
    description: "Run script/develop and mirror rebuilds into core",
  },
  {
    file: "haf-cd",
    name: "haf: cd into tree",
    command: 'cd "$(haf path {{tree}})"',
    description: "Jump into a frontend worktree",
    arguments: [{ name: "tree", description: "Tree name, branch or PR number" }],
  },
];

function workflowsDir(): string {
  if (platform() === "darwin") return join(homedir(), ".warp", "workflows");
  return join(process.env.XDG_DATA_HOME || join(homedir(), ".local", "share"), "warp-terminal", "workflows");
}

const quote = (s: string) => JSON.stringify(s);

function toYaml(w: Workflow): string {
  const lines = [
    `name: ${quote(w.name)}`,
    `command: ${quote(w.command)}`,
    `description: ${quote(w.description)}`,
    `tags: ["haf", "home-assistant"]`,
    `shells: []`,
  ];
  if (w.arguments?.length) {
    lines.push("arguments:");
    for (const a of w.arguments) {
      lines.push(`  - name: ${a.name}`, `    description: ${quote(a.description)}`, `    default_value: ~`);
    }
  }
  return `${lines.join("\n")}\n`;
}

export default defineCommand({
  meta: { name: "warp", description: "Install haf workflows into Warp's command palette" },
  run() {
    const dir = workflowsDir();
    mkdirSync(dir, { recursive: true });
    for (const w of WORKFLOWS) writeFileSync(join(dir, `${w.file}.yaml`), toYaml(w));
    p.log.success(`Installed ${WORKFLOWS.length} workflows to ${pc.dim(tildify(dir))}`);
    p.log.info(`Search for ${pc.cyan("haf")} in Warp's command search or the Workflows panel.`);
  },
});
