import { expect, test } from "bun:test";
import { fromChoice } from "../src/config";

test("fromChoice turns stored defaults into fixed answers", () => {
  expect(fromChoice("always")).toBe(true);
  expect(fromChoice("never")).toBe(false);
  expect(fromChoice("ask")).toBeUndefined();
  expect(fromChoice(undefined)).toBeUndefined();
});
