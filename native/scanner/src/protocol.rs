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
    pub skip_basenames: Vec<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ScanMode {
    Quick,
    Deep,
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
        #[serde(rename = "skipBasenames")]
        skip_basenames: Vec<String>,
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
                skip_basenames,
            } => Some(StartRequest {
                scan_id,
                root,
                mode,
                platform,
                time_budget_ms,
                max_depth,
                same_device_only,
                concurrency,
                skip_basenames,
            }),
            _ => None,
        }
    }
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
