import { z } from "zod";

export const ErrorCodeSchema = z.enum([
  "E_VALIDATION",
  "E_PROTECTED_PATH",
  "E_OPTIN_REQUIRED",
  "E_PERMISSION",
  "E_IO",
  "E_CANCELLED",
  "E_PHASE_GATE",
]);

export const AppErrorSchema = z.object({
  code: ErrorCodeSchema,
  message: z.string().min(1),
  recoverable: z.boolean(),
  details: z.record(z.string(), z.unknown()).optional(),
});

export const SuccessResultSchema = <T extends z.ZodTypeAny>(data: T) =>
  z.object({
    ok: z.literal(true),
    data,
  });

export const FailureResultSchema = z.object({
  ok: z.literal(false),
  error: AppErrorSchema,
});
