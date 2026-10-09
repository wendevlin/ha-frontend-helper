import * as p from "@clack/prompts";
import pc from "picocolors";

export { p, pc };

const isTTY = process.stdout.isTTY;

/** OSC 8 hyperlink — clickable in Warp and most modern terminals. */
export function link(text: string, url: string): string {
  if (!isTTY) return `${text} (${url})`;
  return `\x1b]8;;${url}\x1b\\${text}\x1b]8;;\x1b\\`;
}

/** Set the terminal tab title (OSC 2). */
export function setTitle(title: string): void {
  if (isTTY) process.stdout.write(`\x1b]2;${title}\x07`);
}

/** Unwrap a clack prompt result, exiting cleanly on Ctrl+C. */
export function unwrap<T>(value: T): Exclude<T, symbol> {
  if (p.isCancel(value)) {
    p.cancel("Cancelled.");
    process.exit(130);
  }
  return value as Exclude<T, symbol>;
}

/** Yes/no prompt; without a TTY (scripts, pipes) it answers with the default. */
export async function confirm(opts: Parameters<typeof p.confirm>[0]): Promise<boolean> {
  if (!process.stdin.isTTY) return opts.initialValue ?? false;
  return unwrap(await p.confirm(opts));
}

export function relativeTime(date: Date): string {
  const s = Math.round((Date.now() - date.getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}

export function tildify(path: string): string {
  const home = process.env.HOME;
  return home && path.startsWith(home) ? `~${path.slice(home.length)}` : path;
}
