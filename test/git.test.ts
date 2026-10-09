import { expect, test } from "bun:test";
import { parseBranchMeta } from "../src/git";

test("parseBranchMeta groups values per branch, including dotted branch names", () => {
  const meta = parseBranchMeta(
    [
      "branch.pr-54571-fix.haf-pr 54571",
      "branch.pr-54571-fix.haf-title Migrate outlined icon button",
      "branch.release.2026.10.haf-author someone",
      "branch.dev.merge refs/pull/123/head",
      "",
    ].join("\n"),
  );
  expect(meta.get("pr-54571-fix")?.get("haf-pr")).toBe("54571");
  expect(meta.get("pr-54571-fix")?.get("haf-title")).toBe("Migrate outlined icon button");
  expect(meta.get("release.2026.10")?.get("haf-author")).toBe("someone");
  expect(meta.get("dev")?.get("merge")).toBe("refs/pull/123/head");
});
