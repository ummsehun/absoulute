import { z } from "zod";
import { FailureResultSchema, SuccessResultSchema } from "./common";

export const SystemInfoSchema = z.object({
  platform: z.string().min(1),
  arch: z.string().min(1),
  release: z.string().min(1),
});

export const DefaultScanRootSchema = z.object({
  path: z.string().min(1),
});

export const FullDiskAccessProbeSchema = z.object({
  path: z.string().min(1),
  readable: z.boolean().nullable(),
});

export const FullDiskAccessStatusSchema = z.object({
  platform: z.string().min(1),
  required: z.boolean(),
  granted: z.boolean(),
  canRequest: z.boolean(),
  deniedPaths: z.array(z.string().min(1)),
  probes: z.array(FullDiskAccessProbeSchema),
});

export const GetSystemInfoResultSchema = z.union([
  SuccessResultSchema(SystemInfoSchema),
  FailureResultSchema,
]);

export const GetDefaultScanRootResultSchema = z.union([
  SuccessResultSchema(DefaultScanRootSchema),
  FailureResultSchema,
]);

export const FullDiskAccessStatusResultSchema = z.union([
  SuccessResultSchema(FullDiskAccessStatusSchema),
  FailureResultSchema,
]);
