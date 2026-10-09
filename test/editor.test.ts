import { expect, test } from "bun:test";
import { inVSCode } from "../src/editor";

test("inVSCode detects the integrated terminal", () => {
  expect(inVSCode({ TERM_PROGRAM: "vscode" })).toBe(true);
  expect(inVSCode({ TERM_PROGRAM: "WarpTerminal" })).toBe(false);
  expect(inVSCode({})).toBe(false);
});
