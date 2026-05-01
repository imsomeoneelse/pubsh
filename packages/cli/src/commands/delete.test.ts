// Tests focus on the destructive-action contract: by default delete is a
// dry-run, --yes is required for actual deletion. Output formatting and JSON
// mode are covered by output.test.ts.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../context.js", () => ({
  buildContext: vi.fn(),
}));

import { buildContext } from "../context.js";
import {
  FakeService,
  type OutputCapture,
  captureOutput,
  fixedPublication,
  makeProgram,
} from "./_test-utils.js";
import { registerDelete } from "./delete.js";

const buildContextMock = vi.mocked(buildContext);

describe("pubsh delete", () => {
  let service: FakeService;
  let cap: OutputCapture;
  beforeEach(() => {
    service = new FakeService();
    buildContextMock.mockResolvedValue({ service: service.asService() });
    cap = captureOutput();
  });
  afterEach(() => {
    cap.restore();
    vi.clearAllMocks();
  });

  it("defaults to a dry-run (confirm:false) when --yes is absent", async () => {
    const program = makeProgram(registerDelete);
    await program.parseAsync(["node", "pubsh", "delete", "ivan"]);
    expect(service.deleteCalls).toEqual([{ id: "ivan", confirm: false }]);
    expect(cap.stdout.join("")).toContain("=== DRY RUN ===");
  });

  it("requires --yes to actually delete (confirm:true)", async () => {
    const program = makeProgram(registerDelete);
    service.deleteResult = {
      mode: "deleted",
      publication: fixedPublication(),
      htmlDeleteStatus: 204,
      metaDeleteStatus: 204,
      deletedAt: "2026-01-03T00:00:00.000Z",
    };
    await program.parseAsync(["node", "pubsh", "delete", "ivan", "--yes"]);
    expect(service.deleteCalls).toEqual([{ id: "ivan", confirm: true }]);
    expect(cap.stdout.join("")).not.toContain("DRY RUN");
  });
});
