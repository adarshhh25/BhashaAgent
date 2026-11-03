import { z } from "zod";

export const intelligentMappingRequestSchema = z.object({
  expectedVersion: z.number().int().positive().optional(),
}).strict();
