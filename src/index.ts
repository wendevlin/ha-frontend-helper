#!/usr/bin/env node
import { type CommandDef, defineCommand, runMain } from "citty";
import { ExecaError } from "execa";
import pkg from "../package.json";
import code from "./commands/code";
import completions from "./commands/completions";
import dev from "./commands/dev";
import init from "./commands/init";
import ls from "./commands/ls";
import path from "./commands/path";
import prc from "./commands/prc";
import rm from "./commands/rm";
import status from "./commands/status";
import sync from "./commands/sync";
import use from "./commands/use";
import warp from "./commands/warp";
import { HafError } from "./config";
import { p } from "./ui";

// biome-ignore lint/suspicious/noExplicitAny: commands have different arg shapes
const commands: Record<string, CommandDef<any>> = {
  init,
  prc,
  use,
  dev,
  sync,
  ls,
  rm,
  path,
  code,
  status,
  warp,
  completions,
};

// citty prints a stack trace for any error; show expected ones as a clean message.
for (const command of Object.values(commands)) {
  const run = command.run;
  if (!run) continue;
  command.run = async (ctx) => {
    try {
      await run(ctx);
    } catch (err) {
      handleError(err);
    }
  };
}

const main = defineCommand({
  meta: {
    name: "haf",
    version: pkg.version,
    description: "Home Assistant frontend dev helper — PR checkouts, worktrees and restart-free frontend switching",
  },
  subCommands: commands,
});

function handleError(err: unknown): never {
  if (err instanceof HafError) {
    p.log.error(err.message);
  } else if (err instanceof ExecaError) {
    p.log.error(err.shortMessage);
  } else {
    console.error(err);
  }
  process.exit(1);
}

runMain(main);
