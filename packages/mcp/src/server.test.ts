// Note: stdio happy-path is not covered here — connecting StdioServerTransport
// attaches to process.stdin/stdout, which would interfere with the test runner
// and is the SDK's responsibility, not ours. The Transport union is currently
// `{ kind: "stdio" }` only, so passing anything else is a TS-time error rather
// than a runtime one.

// startMcpServer's behavior is exercised end-to-end by tools.test.ts, which
// covers all 6 tool handlers. This file is a stub kept for future transports.

import { describe, expect, it } from "vitest";
import { startMcpServer } from "./server.js";

describe("startMcpServer()", () => {
  it("is exported", () => {
    expect(typeof startMcpServer).toBe("function");
  });
});
