use std::collections::{HashSet, VecDeque};
use std::path::PathBuf;

use crate::platform::device_id_for_path;
use crate::protocol::{AccuracyMode, DeepPolicyPreset, ScanMode, SoftSkipPathRule, StartRequest};

use super::path_utils::normalize_for_compare;
use super::MIN_FILE_METADATA_CHUNK_SIZE;

const MAX_FILE_METADATA_CHUNK_SIZE: usize = 2_048;

pub(crate) struct TraversalPlan {
    pub(crate) queue: VecDeque<(PathBuf, usize)>,
    pub(crate) skip_set: HashSet<String>,
    pub(crate) is_windows: bool,
    pub(crate) blocked_prefixes: Vec<String>,
    pub(crate) permission_prefixes: Vec<String>,
    pub(crate) soft_skip_path_rules: Vec<SoftSkipPathRule>,
    pub(crate) soft_skip_prefixes: Vec<String>,
    pub(crate) skip_dir_suffixes: Vec<String>,
    pub(crate) root_normalized: String,
    pub(crate) root_device: Option<u64>,
    pub(crate) use_bulk_estimate: bool,
    pub(crate) deep_responsive_preset: bool,
    pub(crate) metadata_batch_size: usize,
}

pub(crate) fn plan_traversal(request: &StartRequest) -> TraversalPlan {
    let root = PathBuf::from(&request.root);
    let mut queue = VecDeque::new();
    queue.push_back((root.clone(), 0_usize));

    let is_windows = request.platform == "win32";
    let root_device = if request.same_device_only {
        device_id_for_path(&root)
    } else {
        None
    };

    TraversalPlan {
        queue,
        skip_set: request
            .skip_basenames
            .iter()
            .map(|s| s.to_ascii_lowercase())
            .collect(),
        is_windows,
        blocked_prefixes: normalize_prefixes(&request.blocked_prefixes, is_windows),
        permission_prefixes: normalize_prefixes(&request.permission_prefixes, is_windows),
        soft_skip_path_rules: normalize_soft_skip_path_rules(&request.soft_skip_path_rules),
        soft_skip_prefixes: normalize_prefixes(&request.soft_skip_prefixes, is_windows),
        skip_dir_suffixes: request
            .skip_dir_suffixes
            .iter()
            .map(|suffix| suffix.to_ascii_lowercase())
            .collect(),
        root_normalized: normalize_for_compare(&request.root, is_windows),
        root_device,
        use_bulk_estimate: matches!(request.mode, ScanMode::Quick)
            && matches!(request.accuracy_mode, AccuracyMode::Preview),
        deep_responsive_preset: matches!(request.mode, ScanMode::Deep)
            && matches!(request.deep_policy_preset, DeepPolicyPreset::Responsive),
        metadata_batch_size: resolve_metadata_batch_size(request),
    }
}

fn resolve_metadata_batch_size(request: &StartRequest) -> usize {
    let desired = request
        .concurrency_policy
        .max
        .max(request.concurrency.max(1))
        * 8;
    desired.clamp(MIN_FILE_METADATA_CHUNK_SIZE, MAX_FILE_METADATA_CHUNK_SIZE)
}

fn normalize_soft_skip_path_rules(rules: &[SoftSkipPathRule]) -> Vec<SoftSkipPathRule> {
    rules
        .iter()
        .map(|rule| SoftSkipPathRule {
            all: rule
                .all
                .iter()
                .map(|fragment| fragment.to_ascii_lowercase())
                .collect(),
            any: rule
                .any
                .iter()
                .map(|fragment| fragment.to_ascii_lowercase())
                .collect(),
        })
        .collect()
}

fn normalize_prefixes(prefixes: &[String], is_windows: bool) -> Vec<String> {
    prefixes
        .iter()
        .map(|prefix| normalize_for_compare(prefix, is_windows))
        .collect()
}

#[cfg(test)]
mod tests {
    use crate::protocol::{
        AccuracyMode, ConcurrencyPolicy, DeepPolicyPreset, ElevationPolicy, EmitPolicy, ScanMode,
        SoftSkipPathRule, StartRequest,
    };

    use super::plan_traversal;

    #[test]
    fn plans_preview_quick_scan_for_bulk_estimate() {
        let request = start_request(
            ScanMode::Quick,
            AccuracyMode::Preview,
            DeepPolicyPreset::Exact,
        );

        let plan = plan_traversal(&request);

        assert!(plan.use_bulk_estimate);
        assert!(!plan.deep_responsive_preset);
        assert!(plan.skip_set.contains("node_modules"));
        assert_eq!(plan.queue.len(), 1);
        assert_eq!(plan.root_normalized, "/Users/Test");
        assert_eq!(plan.permission_prefixes, vec!["/Users/Test/Library/Mail"]);
        assert_eq!(plan.metadata_batch_size, 512);
    }

    #[test]
    fn plans_responsive_deep_scan_policy_inputs() {
        let request = start_request(
            ScanMode::Deep,
            AccuracyMode::Full,
            DeepPolicyPreset::Responsive,
        );

        let plan = plan_traversal(&request);

        assert!(!plan.use_bulk_estimate);
        assert!(plan.deep_responsive_preset);
        assert_eq!(plan.blocked_prefixes, vec!["/System"]);
        assert_eq!(
            plan.soft_skip_path_rules[0].all,
            vec!["/.rustup/toolchains/"]
        );
        assert_eq!(
            plan.soft_skip_path_rules[0].any,
            vec!["/share/doc/", "/lib/rustlib/src/"]
        );
        assert_eq!(plan.soft_skip_prefixes, vec!["/Users/Test/Library/Caches"]);
        assert_eq!(plan.skip_dir_suffixes, vec![".app"]);
    }

    #[test]
    fn clamps_metadata_batch_size_from_concurrency_policy() {
        let mut request = start_request(
            ScanMode::Deep,
            AccuracyMode::Full,
            DeepPolicyPreset::Responsive,
        );
        request.concurrency = 2;
        request.concurrency_policy.max = 2;

        let plan = plan_traversal(&request);

        assert_eq!(plan.metadata_batch_size, 256);

        request.concurrency = 512;
        request.concurrency_policy.max = 512;
        let plan = plan_traversal(&request);

        assert_eq!(plan.metadata_batch_size, 2_048);
    }

    fn start_request(
        mode: ScanMode,
        accuracy_mode: AccuracyMode,
        deep_policy_preset: DeepPolicyPreset,
    ) -> StartRequest {
        StartRequest {
            scan_id: "scan-test".to_string(),
            root: "/Users/Test".to_string(),
            mode,
            platform: "darwin".to_string(),
            time_budget_ms: 500,
            max_depth: 3,
            same_device_only: false,
            concurrency: 16,
            accuracy_mode,
            deep_policy_preset,
            elevation_policy: ElevationPolicy::Manual,
            emit_policy: EmitPolicy::default(),
            concurrency_policy: ConcurrencyPolicy::default(),
            skip_basenames: vec!["Node_Modules".to_string()],
            soft_skip_path_rules: vec![SoftSkipPathRule {
                all: vec!["/.Rustup/Toolchains/".to_string()],
                any: vec!["/Share/Doc/".to_string(), "/lib/rustlib/src/".to_string()],
            }],
            soft_skip_prefixes: vec!["/Users/Test/Library/Caches".to_string()],
            skip_dir_suffixes: vec![".APP".to_string()],
            blocked_prefixes: vec!["/System".to_string()],
            permission_prefixes: vec!["/Users/Test/Library/Mail".to_string()],
        }
    }
}
