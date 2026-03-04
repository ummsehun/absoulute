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

export const CompressedTreePatchSchema = z.object({
  nodesAdded: z.array(z.string()),
  nodesUpdated: z.array(z.string()),
  nodesPruned: z.array(z.string()),
});

export const ScanProgressSchema = z.object({
  scanId: z.string().min(1),
  phase: z.enum(["walking", "paused", "aggregating", "compressing", "finalizing"]),
  scannedCount: z.number().int().nonnegative(),
  totalBytes: z.number().nonnegative(),
  currentPath: z.string().optional(),
});

export const ScanProgressBatchSchema = z.object({
  progress: ScanProgressSchema,
  deltas: z.array(AggDeltaSchema),
  patches: z.array(CompressedTreePatchSchema),
});

export const ScanStartRequestSchema = z.object({
  rootPath: z.string().min(1),
  optInProtected: z.boolean().default(false),
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
