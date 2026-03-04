import { z } from "zod";
import { FailureResultSchema, SuccessResultSchema } from "./common";

export const WindowStateSchema = z.object({
  isFocused: z.boolean(),
  isMaximized: z.boolean(),
  isMinimized: z.boolean(),
  isFullScreen: z.boolean(),
  isVisible: z.boolean(),
});

export const WindowActionResponseSchema = z.object({
  ok: z.boolean(),
});

export const GetWindowStateResultSchema = z.union([
  SuccessResultSchema(WindowStateSchema),
  FailureResultSchema,
]);

export const WindowActionResultSchema = z.union([
  SuccessResultSchema(WindowActionResponseSchema),
  FailureResultSchema,
]);
