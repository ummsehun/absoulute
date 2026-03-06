import type { z } from "zod";
import { AppErrorSchema, ErrorCodeSchema } from "../shared/schemas/common";
import {
  AggDeltaSchema,
  AggBatchSchema,
  CompressedTreePatchSchema,
  ScanCancelRequestSchema,
  ScanCancelResponseSchema,
  ScanCancelResultSchema,
  ScanPauseRequestSchema,
  ScanPauseResponseSchema,
  ScanPauseResultSchema,
  ScanElevationRequestSchema,
  ScanElevationResponseSchema,
  ScanElevationResultSchema,
  ScanPerformanceProfileSchema,
  ScanProgressBatchSchema,
  ScanQuickReadySchema,
  ScanDiagnosticsSchema,
  ScanCoverageSchema,
  ScanDeepPolicyPresetSchema,
  ScanCoverageUpdateSchema,
  ScanTerminalEventSchema,
  ScanTerminalStatusSchema,
  ScanPerfSampleSchema,
  ScanElevationRequiredSchema,
  ScanInflightStatsSchema,
  ScanProgressSchema,
  ScanResumeRequestSchema,
  ScanResumeResponseSchema,
  ScanResumeResultSchema,
  ScanModeSchema,
  ScanAccuracyModeSchema,
  ScanConcurrencyPolicySchema,
  ScanElevationPolicySchema,
  ScanEmitPolicySchema,
  ScanStartRequestSchema,
  ScanStartResponseSchema,
  ScanStartResultSchema,
  ScanConfidenceSchema,
  ScanEngineSchema,
  ScanStageSchema,
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
export type AggBatch = z.infer<typeof AggBatchSchema>;
export type CompressedTreePatch = z.infer<typeof CompressedTreePatchSchema>;
export type ScanProgress = z.infer<typeof ScanProgressSchema>;
export type ScanProgressBatch = z.infer<typeof ScanProgressBatchSchema>;
export type ScanQuickReady = z.infer<typeof ScanQuickReadySchema>;
export type ScanDiagnostics = z.infer<typeof ScanDiagnosticsSchema>;
export type ScanCoverage = z.infer<typeof ScanCoverageSchema>;
export type ScanInflightStats = z.infer<typeof ScanInflightStatsSchema>;
export type ScanCoverageUpdate = z.infer<typeof ScanCoverageUpdateSchema>;
export type ScanTerminalStatus = z.infer<typeof ScanTerminalStatusSchema>;
export type ScanTerminalEvent = z.infer<typeof ScanTerminalEventSchema>;
export type ScanPerfSample = z.infer<typeof ScanPerfSampleSchema>;
export type ScanElevationRequired = z.infer<typeof ScanElevationRequiredSchema>;
export type ScanPerformanceProfile = z.infer<typeof ScanPerformanceProfileSchema>;
export type ScanMode = z.infer<typeof ScanModeSchema>;
export type ScanAccuracyMode = z.infer<typeof ScanAccuracyModeSchema>;
export type ScanDeepPolicyPreset = z.infer<typeof ScanDeepPolicyPresetSchema>;
export type ScanElevationPolicy = z.infer<typeof ScanElevationPolicySchema>;
export type ScanEmitPolicy = z.infer<typeof ScanEmitPolicySchema>;
export type ScanConcurrencyPolicy = z.infer<typeof ScanConcurrencyPolicySchema>;
export type ScanConfidence = z.infer<typeof ScanConfidenceSchema>;
export type ScanEngine = z.infer<typeof ScanEngineSchema>;
export type ScanStage = z.infer<typeof ScanStageSchema>;

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

export type ScanElevationRequest = z.infer<typeof ScanElevationRequestSchema>;
export type ScanElevationResponse = z.infer<typeof ScanElevationResponseSchema>;
export type ScanElevationResult = z.infer<typeof ScanElevationResultSchema>;

export type WindowState = z.infer<typeof WindowStateSchema>;
export type WindowActionResponse = z.infer<typeof WindowActionResponseSchema>;
export type GetWindowStateResult = z.infer<typeof GetWindowStateResultSchema>;
export type WindowActionResult = z.infer<typeof WindowActionResultSchema>;
