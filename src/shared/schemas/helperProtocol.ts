import { z } from "zod";

const HelperIdSchema = z.string().min(1).max(128);

const AbsoluteNormalizedPathSchema = z.string().min(1).max(4096).refine(
  (value) => {
    if (!value.startsWith("/") || value.includes("\0") || value.includes("//")) {
      return false;
    }
    const segments = value.split("/");
    return !segments.includes(".") && !segments.includes("..");
  },
  { message: "Expected an absolute normalized POSIX path" },
);

export const HelperSchemaVersionSchema = z.literal(1);

export const HelperOperationSchema = z.enum([
  "scan.enumerate",
  "health.check",
  "version.get",
]);

export const HelperScanModeSchema = z.enum(["quick", "deep"]);
export const HelperAccuracyModeSchema = z.enum(["preview", "full"]);
export const HelperVolumePolicySchema = z.enum([
  "same-device",
  "root-cross-device",
  "explicit-volumes",
]);
export const HelperPermissionPolicySchema = z.literal("report-only");

export const HelperEmitPolicySchema = z.object({
  batchMaxItems: z.number().int().positive().max(20_000),
  progressIntervalMs: z.number().int().positive().max(5_000),
}).strict();

export const HelperScanEnumeratePayloadSchema = z.object({
  root: AbsoluteNormalizedPathSchema,
  scanMode: HelperScanModeSchema,
  accuracyMode: HelperAccuracyModeSchema,
  volumePolicy: HelperVolumePolicySchema,
  plannedRoots: z.array(AbsoluteNormalizedPathSchema).min(1).max(256),
  maxDepth: z.number().int().nonnegative().max(512),
  sameDeviceOnly: z.boolean(),
  permissionPolicy: HelperPermissionPolicySchema,
  traversalPolicyPlanId: HelperIdSchema,
  emitPolicy: HelperEmitPolicySchema,
}).strict().superRefine((payload, ctx) => {
  if (!payload.plannedRoots.includes(payload.root)) {
    ctx.addIssue({
      code: "custom",
      message: "root must be included in plannedRoots",
      path: ["root"],
    });
  }
  if (payload.volumePolicy === "root-cross-device" && payload.sameDeviceOnly) {
    ctx.addIssue({
      code: "custom",
      message: "root-cross-device requests must not be same-device only",
      path: ["sameDeviceOnly"],
    });
  }
  if (payload.volumePolicy !== "root-cross-device" && !payload.sameDeviceOnly) {
    ctx.addIssue({
      code: "custom",
      message: "same-device and explicit-volumes requests must stay same-device only",
      path: ["sameDeviceOnly"],
    });
  }
});

const EmptyPayloadSchema = z.object({}).strict();

const BaseHelperRequestEnvelopeSchema = z.object({
  schemaVersion: HelperSchemaVersionSchema,
  requestId: HelperIdSchema,
  scanId: HelperIdSchema,
  stageId: HelperIdSchema,
  issuedAtMs: z.number().int().positive(),
  nonce: z.string().min(16).max(256),
}).strict();

export const HelperScanEnumerateRequestSchema = BaseHelperRequestEnvelopeSchema.extend({
  operation: z.literal("scan.enumerate"),
  payload: HelperScanEnumeratePayloadSchema,
});

export const HelperHealthCheckRequestSchema = BaseHelperRequestEnvelopeSchema.extend({
  operation: z.literal("health.check"),
  payload: EmptyPayloadSchema,
});

export const HelperVersionGetRequestSchema = BaseHelperRequestEnvelopeSchema.extend({
  operation: z.literal("version.get"),
  payload: EmptyPayloadSchema,
});

export const HelperRequestEnvelopeSchema = z.discriminatedUnion("operation", [
  HelperScanEnumerateRequestSchema,
  HelperHealthCheckRequestSchema,
  HelperVersionGetRequestSchema,
]);

export const HelperWarnCodeSchema = z.enum([
  "E_HELPER_PERMISSION",
  "E_TCC_PERMISSION",
  "E_IO",
  "E_SCOPE",
  "E_CANCELLED",
]);

export const HelperErrorCodeSchema = z.enum([
  "E_INVALID_CLIENT",
  "E_INVALID_REQUEST",
  "E_UNSUPPORTED_VERSION",
  "E_REPLAYED_REQUEST",
  "E_HELPER_INTERNAL",
]);

export const HelperEntrySchema = z.object({
  path: AbsoluteNormalizedPathSchema,
  parentPath: AbsoluteNormalizedPathSchema,
  kind: z.enum(["file", "dir", "symlink", "other"]),
  size: z.number().nonnegative(),
  mtimeMs: z.number().nonnegative().optional(),
  inode: z.string().min(1).max(128).optional(),
  deviceId: z.string().min(1).max(128).optional(),
  estimated: z.literal(false),
});

export const HelperReadyEventSchema = z.object({
  type: z.literal("ready"),
  requestId: HelperIdSchema,
  helperVersion: z.string().min(1).max(128),
});

export const HelperEntryBatchEventSchema = z.object({
  type: z.literal("entry_batch"),
  requestId: HelperIdSchema,
  items: z.array(HelperEntrySchema).max(20_000),
});

export const HelperProgressEventSchema = z.object({
  type: z.literal("progress"),
  requestId: HelperIdSchema,
  scannedCount: z.number().int().nonnegative(),
  currentPath: AbsoluteNormalizedPathSchema.optional(),
});

export const HelperCoverageEventSchema = z.object({
  type: z.literal("coverage"),
  requestId: HelperIdSchema,
  scannedCount: z.number().int().nonnegative().optional(),
  permissionFailures: z.number().int().nonnegative(),
  ioFailures: z.number().int().nonnegative(),
  scopeFailures: z.number().int().nonnegative().optional(),
});

export const HelperWarnEventSchema = z.object({
  type: z.literal("warn"),
  requestId: HelperIdSchema,
  code: HelperWarnCodeSchema,
  path: AbsoluteNormalizedPathSchema.optional(),
  message: z.string().min(1).max(2048),
});

export const HelperDoneEventSchema = z.object({
  type: z.literal("done"),
  requestId: HelperIdSchema,
  estimated: z.literal(false),
  elapsedMs: z.number().int().nonnegative(),
});

export const HelperErrorEventSchema = z.object({
  type: z.literal("error"),
  requestId: HelperIdSchema,
  code: HelperErrorCodeSchema,
  message: z.string().min(1).max(2048),
});

export const HelperEventSchema = z.discriminatedUnion("type", [
  HelperReadyEventSchema,
  HelperEntryBatchEventSchema,
  HelperProgressEventSchema,
  HelperCoverageEventSchema,
  HelperWarnEventSchema,
  HelperDoneEventSchema,
  HelperErrorEventSchema,
]);

export type HelperScanEnumeratePayload = z.infer<
  typeof HelperScanEnumeratePayloadSchema
>;
export type HelperRequestEnvelope = z.infer<typeof HelperRequestEnvelopeSchema>;
export type HelperEvent = z.infer<typeof HelperEventSchema>;
export type HelperEntry = z.infer<typeof HelperEntrySchema>;
