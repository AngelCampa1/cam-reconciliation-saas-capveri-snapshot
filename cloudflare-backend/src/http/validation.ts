import { z } from "zod";

export const healthResponseSchema = z.object({
  status: z.literal("healthy"),
  version: z.string(),
  environment: z.string(),
  runtime: z.literal("cloudflare-workers"),
  capabilities: z.object({
    terminal_document_delete: z.literal(true),
  }),
});
