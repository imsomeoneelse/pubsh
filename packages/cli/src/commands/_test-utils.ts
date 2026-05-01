// Shared test helpers for the command suites — excluded from the build via
// tsconfig.json (`**/_test-utils.ts`) and from vitest discovery (no `.test.`
// in the filename).

import { Command } from "commander";
import { vi } from "vitest";
import {
  type DeleteInput,
  type DeleteResult,
  type DownloadInput,
  type DownloadResult,
  type ListOptions,
  type Publication,
  type PublicationService,
  type PublicationSummary,
  type PublishInput,
  type PublishResult,
  type UpdateInput,
  slug as realSlug,
} from "@pubsh/core";

export interface OutputCapture {
  stdout: string[];
  stderr: string[];
  restore: () => void;
}

export function captureOutput(): OutputCapture {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const stdoutSpy = vi
    .spyOn(process.stdout, "write")
    .mockImplementation((chunk: string | Uint8Array): boolean => {
      stdout.push(
        typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8"),
      );
      return true;
    });
  const stderrSpy = vi
    .spyOn(process.stderr, "write")
    .mockImplementation((chunk: string | Uint8Array): boolean => {
      stderr.push(
        typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8"),
      );
      return true;
    });
  return {
    stdout,
    stderr,
    restore: () => {
      stdoutSpy.mockRestore();
      stderrSpy.mockRestore();
    },
  };
}

/**
 * Build a minimal commander program that mirrors `index.ts`: registers the
 * global `--json` flag and exitOverride so failing actions throw instead of
 * killing the test process.
 */
export function makeProgram(
  register: (program: Command) => void,
): Command {
  const program = new Command();
  program.exitOverride();
  program
    .name("pubsh")
    .option("--json", "machine-readable JSON output", false);
  register(program);
  return program;
}

export function fixedPublication(
  overrides: Partial<Publication> = {},
): Publication {
  return {
    id: "ivan",
    url: "https://example.com/ivan-abcd.html",
    password: "p4ssw0rd",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-02T00:00:00.000Z",
    key: "ivan-abcd.html",
    ...overrides,
  };
}

export class FakeService {
  publishCalls: PublishInput[] = [];
  updateCalls: UpdateInput[] = [];
  deleteCalls: DeleteInput[] = [];
  downloadCalls: DownloadInput[] = [];
  listCalls: ListOptions[] = [];
  infoCalls: string[] = [];

  publishResult: PublishResult = {
    publication: fixedPublication(),
    isUpdate: false,
    mode: "new",
  };
  updateResult: PublishResult = {
    publication: fixedPublication(),
    isUpdate: true,
    mode: "update",
  };
  deleteResult: DeleteResult = {
    mode: "dry-run",
    publication: fixedPublication(),
  };
  downloadResult: DownloadResult = {
    publication: fixedPublication(),
    html: "<h1>secret</h1>",
    decryptedBytes: 15,
  };
  listResult: PublicationSummary[] = [
    { id: "ivan", updatedAt: "2026-01-02T00:00:00.000Z" },
    { id: "petya", updatedAt: "2026-01-01T00:00:00.000Z" },
  ];
  infoResult: Publication = fixedPublication();

  slug(input: string): string {
    return realSlug(input);
  }
  async publish(input: PublishInput): Promise<PublishResult> {
    this.publishCalls.push(input);
    return this.publishResult;
  }
  async update(input: UpdateInput): Promise<PublishResult> {
    this.updateCalls.push(input);
    return this.updateResult;
  }
  async delete(input: DeleteInput): Promise<DeleteResult> {
    this.deleteCalls.push(input);
    return this.deleteResult;
  }
  async download(input: DownloadInput): Promise<DownloadResult> {
    this.downloadCalls.push(input);
    return this.downloadResult;
  }
  async list(opts: ListOptions): Promise<PublicationSummary[]> {
    this.listCalls.push(opts);
    return this.listResult;
  }
  async info(id: string): Promise<Publication> {
    this.infoCalls.push(id);
    return this.infoResult;
  }
  asService(): PublicationService {
    return this as unknown as PublicationService;
  }
}
