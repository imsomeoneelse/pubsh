import { createPublicationService, type PublicationService } from "@pubsh/core";
import { loadConfig } from "./config.js";

export interface CliContext {
  service: PublicationService;
}

export async function buildContext(): Promise<CliContext> {
  const config = loadConfig();
  const service = createPublicationService({ config });
  return { service };
}
