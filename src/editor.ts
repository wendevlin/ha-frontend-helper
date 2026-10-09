import { HafError } from "./config";
import { run, which } from "./git";

/** True inside VS Code's integrated terminal (forks like Cursor set this too). */
export function inVSCode(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.TERM_PROGRAM === "vscode";
}

/** The VS Code CLI on PATH, preferring Insiders when running inside it. */
export function codeCli(env: NodeJS.ProcessEnv = process.env): string | undefined {
  const insiders = env.TERM_PROGRAM_VERSION?.includes("insider");
  const candidates = insiders ? ["code-insiders", "code"] : ["code", "code-insiders"];
  return candidates.find((bin) => which(bin));
}

/** Open a folder in a new VS Code window. */
export async function openInVSCode(path: string): Promise<void> {
  const cli = codeCli();
  if (!cli)
    throw new HafError(
      "The `code` command is not on your PATH. In VS Code, run “Shell Command: Install 'code' command in PATH”.",
    );
  await run([cli, "--new-window", path], path);
}
