import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parsePrcArgs } from "../src/commands/prc";
import { patchConfigurationYaml, readDevelopmentRepo } from "../src/core";

let dir: string;
const yaml = () => readFileSync(join(dir, "configuration.yaml"), "utf8");
const write = (content: string) => writeFileSync(join(dir, "configuration.yaml"), content);

beforeEach(() => (dir = mkdtempSync(join(tmpdir(), "haf-core-"))));
afterEach(() => rmSync(dir, { recursive: true, force: true }));

test("adds development_repo to an existing frontend block", () => {
  write(
    "default_config:\n\nfrontend:\n  themes: !include_dir_merge_named themes\n\nautomation: !include automations.yaml\n",
  );
  expect(patchConfigurationYaml(dir, "/m")).toBe(true);
  expect(yaml()).toBe(
    "default_config:\n\nfrontend:\n  development_repo: /m\n  themes: !include_dir_merge_named themes\n\nautomation: !include automations.yaml\n",
  );
  expect(readDevelopmentRepo(dir)).toBe("/m");
  expect(patchConfigurationYaml(dir, "/m")).toBe(false);
});

test("replaces an existing development_repo", () => {
  write("frontend:\n    development_repo: /old\n");
  patchConfigurationYaml(dir, "/new");
  expect(yaml()).toBe("frontend:\n    development_repo: /new\n");
});

test("appends a frontend block when missing", () => {
  write("default_config:\n");
  patchConfigurationYaml(dir, "/m");
  expect(yaml()).toBe("default_config:\n\nfrontend:\n  development_repo: /m\n");
});

test("parsePrcArgs handles the optional --tree value", () => {
  expect(parsePrcArgs(["123"])).toEqual({ number: 123, tree: undefined });
  expect(parsePrcArgs(["123", "--tree"])).toEqual({ number: 123, tree: "" });
  expect(parsePrcArgs(["123", "--tree", "foo"])).toEqual({ number: 123, tree: "foo" });
  expect(parsePrcArgs(["--tree", "123"])).toEqual({ number: 123, tree: "" });
  expect(parsePrcArgs(["--tree", "foo", "123"])).toEqual({ number: 123, tree: "foo" });
  expect(parsePrcArgs(["-t", "123", "--use"])).toEqual({ number: 123, tree: "" });
  expect(parsePrcArgs(["--tree=bar", "#123"])).toEqual({ number: 123, tree: "bar" });
  expect(() => parsePrcArgs(["--tree"])).toThrow();
});
