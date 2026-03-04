use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Deserialize)]
pub struct StartRequest {
    pub scan_id: String,
    pub root: String,
    pub mode: ScanMode,
    pub platform: String,
    pub time_budget_ms: u64,
    pub max_depth: usize,
    pub same_device_only: bool,
    pub concurrency: usize,
    pub accuracy_mode: AccuracyMode,
    pub elevation_policy: ElevationPolicy,
    pub emit_policy: EmitPolicy,
    pub concurrency_policy: ConcurrencyPolicy,
    pub skip_basenames: Vec<String>,
    pub soft_skip_prefixes: Vec<String>,
    pub skip_dir_suffixes: Vec<String>,
    pub blocked_prefixes: Vec<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ScanMode {
    Quick,
    Deep,
}

#[derive(Debug, Clone, Copy, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AccuracyMode {
    Preview,
    Full,
}

impl Default for AccuracyMode {
    fn default() -> Self {
        Self::Full
    }
}

#[derive(Debug, Clone, Copy, Deserialize, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum ElevationPolicy {
    Auto,
    Manual,
    None,
}

impl Default for ElevationPolicy {
    fn default() -> Self {
        Self::Manual
    }
}

#[derive(Debug, Clone, Deserialize)]
pub struct EmitPolicy {
    #[serde(rename = "aggBatchMaxItems")]
    #[serde(default = "default_agg_batch_max_items")]
    pub agg_batch_max_items: usize,
    #[serde(rename = "aggBatchMaxMs")]
    #[serde(default = "default_agg_batch_max_ms")]
    pub agg_batch_max_ms: u64,
    #[serde(rename = "progressIntervalMs")]
    #[serde(default = "default_progress_interval_ms")]
    pub progress_interval_ms: u64,
}

impl Default for EmitPolicy {
    fn default() -> Self {
        Self {
            agg_batch_max_items: default_agg_batch_max_items(),
            agg_batch_max_ms: default_agg_batch_max_ms(),
            progress_interval_ms: default_progress_interval_ms(),
        }
    }
}

#[derive(Debug, Clone, Deserialize)]
pub struct ConcurrencyPolicy {
    #[serde(default = "default_concurrency_min")]
    pub min: usize,
    #[serde(default = "default_concurrency_max")]
    pub max: usize,
    #[serde(default = "default_concurrency_adaptive")]
    pub adaptive: bool,
}

impl Default for ConcurrencyPolicy {
    fn default() -> Self {
        Self {
            min: default_concurrency_min(),
            max: default_concurrency_max(),
            adaptive: default_concurrency_adaptive(),
        }
    }
}

fn default_agg_batch_max_items() -> usize {
    512
}

fn default_agg_batch_max_ms() -> u64 {
    120
}

fn default_progress_interval_ms() -> u64 {
    120
}

fn default_concurrency_min() -> usize {
    16
}

fn default_concurrency_max() -> usize {
    64
}

fn default_concurrency_adaptive() -> bool {
    true
}

#[derive(Debug, Deserialize)]
#[serde(tag = "type")]
pub enum IncomingMessage {
    #[serde(rename = "start")]
    Start {
        #[serde(rename = "scanId")]
        scan_id: String,
        root: String,
        mode: ScanMode,
        platform: String,
        #[serde(rename = "timeBudgetMs")]
        time_budget_ms: u64,
        #[serde(rename = "maxDepth")]
        max_depth: usize,
        #[serde(rename = "sameDeviceOnly")]
        same_device_only: bool,
        concurrency: usize,
        #[serde(rename = "accuracyMode")]
        #[serde(default)]
        accuracy_mode: AccuracyMode,
        #[serde(rename = "elevationPolicy")]
        #[serde(default)]
        elevation_policy: ElevationPolicy,
        #[serde(rename = "emitPolicy")]
        #[serde(default)]
        emit_policy: EmitPolicy,
        #[serde(rename = "concurrencyPolicy")]
        #[serde(default)]
        concurrency_policy: ConcurrencyPolicy,
        #[serde(rename = "skipBasenames")]
        skip_basenames: Vec<String>,
        #[serde(rename = "softSkipPrefixes")]
        #[serde(default)]
        soft_skip_prefixes: Vec<String>,
        #[serde(rename = "skipDirSuffixes")]
        #[serde(default)]
        skip_dir_suffixes: Vec<String>,
        #[serde(rename = "blockedPrefixes")]
        #[serde(default)]
        blocked_prefixes: Vec<String>,
    },
    #[serde(rename = "pause")]
    Pause,
    #[serde(rename = "resume")]
    Resume,
    #[serde(rename = "cancel")]
    Cancel,
}

impl IncomingMessage {
    pub fn into_start(self) -> Option<StartRequest> {
        match self {
            IncomingMessage::Start {
                scan_id,
                root,
                mode,
                platform,
                time_budget_ms,
                max_depth,
                same_device_only,
                concurrency,
                accuracy_mode,
                elevation_policy,
                emit_policy,
                concurrency_policy,
                skip_basenames,
                soft_skip_prefixes,
                skip_dir_suffixes,
                blocked_prefixes,
            } => Some(StartRequest {
                scan_id,
                root,
                mode,
                platform,
                time_budget_ms,
                max_depth,
                same_device_only,
                concurrency,
                accuracy_mode,
                elevation_policy,
                emit_policy,
                concurrency_policy,
                skip_basenames,
                soft_skip_prefixes,
                skip_dir_suffixes,
                blocked_prefixes,
            }),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct AggBatchItem {
    pub path: String,
    #[serde(rename = "sizeDelta")]
    pub size_delta: u64,
    #[serde(rename = "countDelta")]
    pub count_delta: u64,
    pub estimated: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct CoverageSummary {
    pub scanned: u64,
    #[serde(rename = "blockedByPolicy")]
    pub blocked_by_policy: u64,
    #[serde(rename = "blockedByPermission")]
    pub blocked_by_permission: u64,
    #[serde(rename = "elevationRequired")]
    pub elevation_required: bool,
}

#[derive(Debug, Serialize)]
#[serde(tag = "type")]
pub enum OutgoingMessage {
    #[serde(rename = "agg")]
    Agg {
        path: String,
        #[serde(rename = "sizeDelta")]
        size_delta: u64,
        #[serde(rename = "countDelta")]
        count_delta: u64,
        estimated: bool,
    },
    #[serde(rename = "agg_batch")]
    AggBatch {
        items: Vec<AggBatchItem>,
    },
    #[serde(rename = "progress")]
    Progress {
        #[serde(rename = "scannedCount")]
        scanned_count: u64,
        #[serde(rename = "queuedDirs")]
        queued_dirs: usize,
        #[serde(rename = "elapsedMs")]
        elapsed_ms: u64,
        #[serde(rename = "currentPath")]
        current_path: Option<String>,
    },
    #[serde(rename = "diagnostics")]
    Diagnostics {
        #[serde(rename = "filesPerSec")]
        files_per_sec: f64,
        #[serde(rename = "stageElapsedMs")]
        stage_elapsed_ms: u64,
        #[serde(rename = "ioWaitRatio")]
        io_wait_ratio: f64,
        #[serde(rename = "queueDepth")]
        queue_depth: usize,
        #[serde(rename = "hotPath")]
        hot_path: Option<String>,
    },
    #[serde(rename = "coverage")]
    Coverage {
        scanned: u64,
        #[serde(rename = "blockedByPolicy")]
        blocked_by_policy: u64,
        #[serde(rename = "blockedByPermission")]
        blocked_by_permission: u64,
        #[serde(rename = "elevationRequired")]
        elevation_required: bool,
    },
    #[serde(rename = "elevation_required")]
    ElevationRequired {
        #[serde(rename = "targetPath")]
        target_path: String,
        reason: String,
        policy: ElevationPolicy,
    },
    #[serde(rename = "quick_ready")]
    QuickReady {
        #[serde(rename = "elapsedMs")]
        elapsed_ms: u64,
        confidence: Confidence,
        estimated: bool,
    },
    #[serde(rename = "warn")]
    Warn {
        code: String,
        message: String,
        path: Option<String>,
        recoverable: bool,
    },
    #[serde(rename = "done")]
    Done {
        #[serde(rename = "elapsedMs")]
        elapsed_ms: u64,
        estimated: bool,
    },
}

#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Confidence {
    Low,
    Medium,
    High,
}
