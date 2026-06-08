import { z } from "zod";
import { FailureResultSchema, SuccessResultSchema } from "./common";
import {
  ScanHelperLifecycleSchema,
  ScanHelperReadinessBlockerSchema,
  ScanHelperRegistrationBlockerSchema,
} from "./scan";

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

export const HelperRegistrationPreflightSchema = z.object({
  status: z.enum(["ready", "blocked"]),
  blockers: z.array(ScanHelperRegistrationBlockerSchema),
  contract: z.object({
    appBundleIdentifier: z.string().min(1),
    helperExecutableBundleRelativePath: z.string().min(1),
    helperLabel: z.string().min(1),
    launchDaemonBundleRelativePath: z.string().min(1),
    launchDaemonPlistName: z.string().min(1),
    serviceManagementModel: z.literal("smappservice-daemon"),
  }),
});

export const HelperClientStatusSchema = z.object({
  available: z.boolean(),
  lifecycle: ScanHelperLifecycleSchema.optional(),
  registrationPreflight: HelperRegistrationPreflightSchema.optional(),
  reason: z.string().min(1).optional(),
  readinessBlockers: z.array(ScanHelperReadinessBlockerSchema).optional(),
  transport: z.enum(["disabled", "xpc"]),
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

export const HelperClientStatusResultSchema = z.union([
  SuccessResultSchema(HelperClientStatusSchema),
  FailureResultSchema,
]);
