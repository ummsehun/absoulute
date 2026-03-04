import type { z } from "zod";
import { AppErrorSchema, ErrorCodeSchema } from "../shared/schemas/common";
import {
  AggDeltaSchema,
  CompressedTreePatchSchema,
  ScanCancelRequestSchema,
  ScanCancelResponseSchema,
  ScanCancelResultSchema,
  ScanPauseRequestSchema,
  ScanPauseResponseSchema,
  ScanPauseResultSchema,
  ScanProgressBatchSchema,
  ScanProgressSchema,
  ScanResumeRequestSchema,
  ScanResumeResponseSchema,
  ScanResumeResultSchema,
  ScanStartRequestSchema,
  ScanStartResponseSchema,
  ScanStartResultSchema,
  StatRecordSchema,
  WalkEntrySchema,
} from "../shared/schemas/scan";
import {
  GetDefaultScanRootResultSchema,
  GetSystemInfoResultSchema,
  SystemInfoSchema,
} from "../shared/schemas/system";
import {
  GetWindowStateResultSchema,
  WindowActionResponseSchema,
  WindowActionResultSchema,
  WindowStateSchema,
} from "../shared/schemas/window";

export type ErrorCode = z.infer<typeof ErrorCodeSchema>;
export type AppError = z.infer<typeof AppErrorSchema>;

export type SystemInfo = z.infer<typeof SystemInfoSchema>;
export type GetSystemInfoResult = z.infer<typeof GetSystemInfoResultSchema>;
export type GetDefaultScanRootResult = z.infer<typeof GetDefaultScanRootResultSchema>;

export type WalkEntry = z.infer<typeof WalkEntrySchema>;
export type StatRecord = z.infer<typeof StatRecordSchema>;
export type AggDelta = z.infer<typeof AggDeltaSchema>;
export type CompressedTreePatch = z.infer<typeof CompressedTreePatchSchema>;
export type ScanProgress = z.infer<typeof ScanProgressSchema>;
export type ScanProgressBatch = z.infer<typeof ScanProgressBatchSchema>;

export type ScanStartRequest = z.infer<typeof ScanStartRequestSchema>;
export type ScanStartResponse = z.infer<typeof ScanStartResponseSchema>;
export type ScanStartResult = z.infer<typeof ScanStartResultSchema>;

export type ScanCancelRequest = z.infer<typeof ScanCancelRequestSchema>;
export type ScanCancelResponse = z.infer<typeof ScanCancelResponseSchema>;
export type ScanCancelResult = z.infer<typeof ScanCancelResultSchema>;

export type ScanPauseRequest = z.infer<typeof ScanPauseRequestSchema>;
export type ScanPauseResponse = z.infer<typeof ScanPauseResponseSchema>;
export type ScanPauseResult = z.infer<typeof ScanPauseResultSchema>;

export type ScanResumeRequest = z.infer<typeof ScanResumeRequestSchema>;
export type ScanResumeResponse = z.infer<typeof ScanResumeResponseSchema>;
export type ScanResumeResult = z.infer<typeof ScanResumeResultSchema>;

export type WindowState = z.infer<typeof WindowStateSchema>;
export type WindowActionResponse = z.infer<typeof WindowActionResponseSchema>;
export type GetWindowStateResult = z.infer<typeof GetWindowStateResultSchema>;
export type WindowActionResult = z.infer<typeof WindowActionResultSchema>;
