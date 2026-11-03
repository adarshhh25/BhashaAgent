import { z } from "zod";

export const ttsServerMessageSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("start"), request_id: z.string().optional() }),
  z.object({
    type: z.literal("audio"),
    data: z.object({
      chunk_index: z.number().int().nonnegative(),
      audio: z.string(),
      is_final: z.boolean().optional(),
    }),
  }),
  z.object({
    type: z.literal("complete"),
    data: z.object({
      chunk_index: z.number().int().nonnegative(),
      audio: z.string(),
      is_final: z.literal(true),
    }),
  }),
  z.object({ type: z.literal("error"), message: z.string() }),
]);

export type TtsServerMessage = z.infer<typeof ttsServerMessageSchema>;
