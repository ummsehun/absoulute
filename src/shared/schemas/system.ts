import { z } from "zod";
import { FailureResultSchema, SuccessResultSchema } from "./common";

export const SystemInfoSchema = z.object({
  platform: z.string().min(1),
  arch: z.string().min(1),
  release: z.string().min(1),
});

export const GetSystemInfoResultSchema = z.union([
  SuccessResultSchema(SystemInfoSchema),
  FailureResultSchema,
]);
