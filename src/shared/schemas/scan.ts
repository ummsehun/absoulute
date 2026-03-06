import { z } from "zod";
import { FailureResultSchema, SuccessResultSchema } from "./common";

export const NodeKindSchema = z.enum(["file", "dir", "symlink"]);

export const WalkEntrySchema = z.object({
  path: z.string().min(1),
  kind: NodeKindSchema,
  parentPath: z.string().min(1),
  depth: z.number().int().nonnegative(),
});

export const StatRecordSchema = z.object({
  path: z.string().min(1),
  size: z.number().nonnegative(),
  mtime: z.number().nonnegative(),
  isSymlink: z.boolean(),
  inode: z.string().optional(),
});

export const AggDeltaSchema = z.object({
  nodePath: z.string().min(1),
  sizeDelta: z.number(),
  countDelta: z.number().int(),
});

export const AggBatchSchema = z.object({
  items: z.array(AggDeltaSchema),
  emittedAt: z.number().int().nonnegative().optional(),
});

export const CompressedTreePatchSchema = z.object({
  nodesAdded: z.array(z.string()),
  nodesUpdated: z.array(z.string()),
  nodesPruned: z.array(z.string()),
});

export const ScanStageSchema = z.enum(["quick", "deep"]);
export const ScanConfidenceSchema = z.enum(["low", "medium", "high"]);
export const ScanPerformanceProfileSchema = z.enum([
  "balanced",
  "preview-first",
  "accuracy-first",
]);
export const ScanModeSchema = z.enum([
  "portable",
  "portable_plus_os_accel",
  "native_rust",
]);
export const ScanEngineSchema = z.enum(["node", "native"]);
export const ScanAccuracyModeSchema = z.enum(["preview", "full"]);
export const ScanElevationPolicySchema = z.enum(["auto", "manual", "none"]);
export const ScanDeepPolicyPresetSchema = z.enum(["responsive", "exact"]);

export const ScanEmitPolicySchema = z.object({
  aggBatchMaxItems: z.number().int().positive().max(20_000).optional(),
  aggBatchMaxMs: z.number().int().positive().max(5_000).optional(),
  progressIntervalMs: z.number().int().positive().max(5_000).optional(),
});

export const ScanConcurrencyPolicySchema = z.object({
  min: z.number().int().positive().max(256).optional(),
  max: z.number().int().positive().max(256).optional(),
  adaptive: z.boolean().optional(),
});

export const ScanCoverageSchema = z.object({
  scanned: z.number().int().nonnegative(),
  blockedByPolicy: z.number().int().nonnegative(),
  blockedByPermission: z.number().int().nonnegative(),
  elevationRequired: z.boolean(),
});

export const ScanInflightStatsSchema = z.object({
  inFlight: z.number().int().nonnegative(),
  queuedDirs: z.number().int().nonnegative().optional(),
});

export const ScanProgressSchema = z.object({
  scanId: z.string().min(1),
  phase: z.enum(["walking", "paused", "aggregating", "compressing", "finalizing"]),
  scanStage: ScanStageSchema.optional(),
  quickReady: z.boolean().optional(),
  confidence: ScanConfidenceSchema.optional(),
  estimated: z.boolean().optional(),
  scannedCount: z.number().int().nonnegative(),
  totalBytes: z.number().nonnegative(),
  currentPath: z.string().optional(),
});

export const ScanProgressBatchSchema = z.object({
  progress: ScanProgressSchema,
  deltas: z.array(AggDeltaSchema),
  aggBatches: z.array(AggBatchSchema).optional(),
  patches: z.array(CompressedTreePatchSchema),
});

export const ScanStartRequestSchema = z.object({
  rootPath: z.string().min(1),
  optInProtected: z.boolean().default(false),
  performanceProfile: ScanPerformanceProfileSchema.optional(),
  scanMode: ScanModeSchema.optional(),
  quickBudgetMs: z.number().int().positive().max(30_000).optional(),
  accuracyMode: ScanAccuracyModeSchema.optional(),
  deepPolicyPreset: ScanDeepPolicyPresetSchema.optional(),
  elevationPolicy: ScanElevationPolicySchema.optional(),
  emitPolicy: ScanEmitPolicySchema.optional(),
  concurrencyPolicy: ScanConcurrencyPolicySchema.optional(),
  allowNodeFallback: z.boolean().optional(),
});

export const ScanStartResponseSchema = z.object({
  scanId: z.string().min(1),
  startedAt: z.number().int().positive(),
});

export const ScanCancelRequestSchema = z.object({
  scanId: z.string().min(1),
});

export const ScanPauseRequestSchema = z.object({
  scanId: z.string().min(1),
});

export const ScanResumeRequestSchema = z.object({
  scanId: z.string().min(1),
});

export const ScanCancelResponseSchema = z.object({
  ok: z.boolean(),
});

export const ScanPauseResponseSchema = z.object({
  ok: z.boolean(),
});

export const ScanResumeResponseSchema = z.object({
  ok: z.boolean(),
});

export const ScanElevationRequestSchema = z.object({
  targetPath: z.string().min(1),
});

export const ScanElevationResponseSchema = z.object({
  granted: z.boolean(),
});

export const ScanQuickReadySchema = z.object({
  scanId: z.string().min(1),
  rootPath: z.string().min(1),
  quickReadyAt: z.number().int().positive(),
  elapsedMs: z.number().int().nonnegative(),
  scanStage: ScanStageSchema.default("quick"),
  confidence: ScanConfidenceSchema.default("medium"),
  estimated: z.boolean().default(true),
});

export const ScanDiagnosticsSchema = z.object({
  scanId: z.string().min(1),
  phase: ScanProgressSchema.shape.phase,
  scanStage: ScanStageSchema.optional(),
  elapsedMs: z.number().int().nonnegative(),
  scannedCount: z.number().int().nonnegative(),
  totalBytes: z.number().nonnegative(),
  queueDepth: z.number().int().nonnegative(),
  recoverableErrors: z.number().int().nonnegative(),
  permissionErrors: z.number().int().nonnegative(),
  ioErrors: z.number().int().nonnegative(),
  estimatedDirectories: z.number().int().nonnegative().optional(),
  engine: ScanEngineSchema.optional(),
  fallbackReason: z.string().min(1).optional(),
  cpuHint: z.string().min(1).optional(),
  filesPerSec: z.number().nonnegative().optional(),
  stageElapsedMs: z.number().int().nonnegative().optional(),
  ioWaitRatio: z.number().min(0).max(1).optional(),
  hotPath: z.string().min(1).optional(),
  coverage: ScanCoverageSchema.optional(),
  softSkippedByPolicy: z.number().int().nonnegative().optional(),
  deferredByBudget: z.number().int().nonnegative().optional(),
  inflightStats: ScanInflightStatsSchema.optional(),
});

export const ScanCoverageUpdateSchema = z.object({
  scanId: z.string().min(1),
  coverage: ScanCoverageSchema,
});

export const ScanTerminalStatusSchema = z.enum(["done", "canceled", "failed"]);

export const ScanTerminalEventSchema = z.object({
  scanId: z.string().min(1),
  status: ScanTerminalStatusSchema,
  finishedAt: z.number().int().positive(),
});

export const ScanPerfSampleSchema = z.object({
  scanId: z.string().min(1),
  filesPerSec: z.number().nonnegative(),
  stageElapsedMs: z.number().int().nonnegative(),
  ioWaitRatio: z.number().min(0).max(1),
  queueDepth: z.number().int().nonnegative(),
  hotPath: z.string().min(1).optional(),
  coverage: ScanCoverageSchema.optional(),
  softSkippedByPolicy: z.number().int().nonnegative().optional(),
  deferredByBudget: z.number().int().nonnegative().optional(),
  inflightStats: ScanInflightStatsSchema.optional(),
});

export const ScanElevationRequiredSchema = z.object({
  scanId: z.string().min(1),
  targetPath: z.string().min(1),
  reason: z.string().min(1),
  policy: ScanElevationPolicySchema,
});

export const ScanStartResultSchema = z.union([
  SuccessResultSchema(ScanStartResponseSchema),
  FailureResultSchema,
]);

export const ScanCancelResultSchema = z.union([
  SuccessResultSchema(ScanCancelResponseSchema),
  FailureResultSchema,
]);

export const ScanPauseResultSchema = z.union([
  SuccessResultSchema(ScanPauseResponseSchema),
  FailureResultSchema,
]);

export const ScanResumeResultSchema = z.union([
  SuccessResultSchema(ScanResumeResponseSchema),
  FailureResultSchema,
]);

export const ScanElevationResultSchema = z.union([
  SuccessResultSchema(ScanElevationResponseSchema),
  FailureResultSchema,
]);
