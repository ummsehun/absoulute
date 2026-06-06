import Foundation

struct HelperRequest: Decodable {
    let schemaVersion: Int
    let requestId: String
    let scanId: String
    let stageId: String
    let operation: String
    let issuedAtMs: Int
    let nonce: String
    let payload: Payload
}

struct Payload: Decodable {
    let root: String
    let scanMode: String
    let accuracyMode: String
    let volumePolicy: String
    let plannedRoots: [String]
    let maxDepth: Int
    let sameDeviceOnly: Bool
    let permissionPolicy: String
    let traversalPolicyPlanId: String
    let emitPolicy: EmitPolicy
}

struct EmitPolicy: Decodable {
    let batchMaxItems: Int
    let progressIntervalMs: Int
}

struct EntryEventItem: Encodable {
    let path: String
    let parentPath: String
    let kind: String
    let size: UInt64
    let mtimeMs: Double?
    let inode: String?
    let deviceId: String?
    let estimated: Bool
}

let startedAt = Date()
let input = FileHandle.standardInput.readDataToEndOfFile()

do {
    let request = try JSONDecoder().decode(HelperRequest.self, from: input)
    try validateRequest(request)
    emit([
        "type": "ready",
        "requestId": request.requestId,
        "helperVersion": "dev-enumerate-0.1.0",
    ])
    try enumerate(request)
} catch {
    let requestId = decodeRequestId(from: input) ?? "unknown"
    emit([
        "type": "error",
        "requestId": requestId,
        "code": "E_INVALID_REQUEST",
        "message": "invalid helper enumerate request: \(error)",
    ])
    exit(1)
}

func enumerate(_ request: HelperRequest) throws {
    let root = URL(fileURLWithPath: request.payload.root, isDirectory: true)
    let rootDepth = depth(of: root.path)
    var batch: [[String: Any]] = []
    var scannedCount = 0
    var permissionFailures = 0
    var ioFailures = 0
    var scopeFailures = 0
    let rootDeviceId = try deviceIdForPath(root.path)

    guard let enumerator = FileManager.default.enumerator(
        at: root,
        includingPropertiesForKeys: [
            .contentModificationDateKey,
            .fileAllocatedSizeKey,
            .fileResourceIdentifierKey,
            .isDirectoryKey,
            .isRegularFileKey,
            .isSymbolicLinkKey,
            .totalFileAllocatedSizeKey,
        ],
        options: [],
        errorHandler: { url, error in
            permissionFailures += 1
            emitWarn(
                requestId: request.requestId,
                code: "E_HELPER_PERMISSION",
                path: url.path,
                message: error.localizedDescription
            )
            return true
        }
    ) else {
        emitWarn(
            requestId: request.requestId,
            code: "E_IO",
            path: root.path,
            message: "failed to create directory enumerator"
        )
        emitCoverage(requestId: request.requestId, scannedCount: scannedCount, permissionFailures: permissionFailures, ioFailures: 1, scopeFailures: scopeFailures)
        emitDone(requestId: request.requestId)
        return
    }

    for case let url as URL in enumerator {
        if depth(of: url.path) - rootDepth > request.payload.maxDepth {
            enumerator.skipDescendants()
            continue
        }

        do {
            let attributes = try FileManager.default.attributesOfItem(atPath: url.path)
            let itemDeviceId = deviceId(from: attributes)
            if request.payload.sameDeviceOnly && rootDeviceId != nil && itemDeviceId != rootDeviceId {
                scopeFailures += 1
                emitWarn(
                    requestId: request.requestId,
                    code: "E_SCOPE",
                    path: url.path,
                    message: "skipped cross-device entry"
                )
                if isDirectory(attributes) {
                    enumerator.skipDescendants()
                }
                continue
            }

            let item = try makeEntryItem(url, attributes: attributes)
            batch.append(item)
            scannedCount += 1
        } catch {
            ioFailures += 1
            emitWarn(
                requestId: request.requestId,
                code: "E_IO",
                path: url.path,
                message: error.localizedDescription
            )
        }

        if batch.count >= max(1, request.payload.emitPolicy.batchMaxItems) {
            emitEntryBatch(requestId: request.requestId, items: batch)
            batch.removeAll(keepingCapacity: true)
            emitProgress(requestId: request.requestId, scannedCount: scannedCount, currentPath: url.path)
        }
    }

    if !batch.isEmpty {
        emitEntryBatch(requestId: request.requestId, items: batch)
    }
    emitProgress(requestId: request.requestId, scannedCount: scannedCount, currentPath: root.path)
    emitCoverage(requestId: request.requestId, scannedCount: scannedCount, permissionFailures: permissionFailures, ioFailures: ioFailures, scopeFailures: scopeFailures)
    emitDone(requestId: request.requestId)
}

func validateRequest(_ request: HelperRequest) throws {
    guard request.schemaVersion == 1 else {
        throw ValidationError.invalidSchemaVersion
    }
    try validateId(request.requestId, field: "requestId")
    try validateId(request.scanId, field: "scanId")
    try validateId(request.stageId, field: "stageId")
    guard request.issuedAtMs > 0 else {
        throw ValidationError.invalidField("issuedAtMs")
    }
    guard request.nonce.count >= 16 && request.nonce.count <= 256 else {
        throw ValidationError.invalidField("nonce")
    }
    guard request.operation == "scan.enumerate" else {
        throw ValidationError.unsupportedOperation
    }
    guard request.payload.scanMode == "quick" || request.payload.scanMode == "deep" else {
        throw ValidationError.invalidField("scanMode")
    }
    guard request.payload.accuracyMode == "preview" || request.payload.accuracyMode == "full" else {
        throw ValidationError.invalidField("accuracyMode")
    }
    guard ["same-device", "root-cross-device", "explicit-volumes"].contains(request.payload.volumePolicy) else {
        throw ValidationError.invalidField("volumePolicy")
    }
    if request.payload.volumePolicy == "root-cross-device" && request.payload.sameDeviceOnly {
        throw ValidationError.invalidField("sameDeviceOnly")
    }
    if request.payload.volumePolicy != "root-cross-device" && !request.payload.sameDeviceOnly {
        throw ValidationError.invalidField("sameDeviceOnly")
    }
    guard request.payload.permissionPolicy == "report-only" else {
        throw ValidationError.invalidField("permissionPolicy")
    }
    try validateId(request.payload.traversalPolicyPlanId, field: "traversalPolicyPlanId")
    guard request.payload.maxDepth >= 0 && request.payload.maxDepth <= 512 else {
        throw ValidationError.invalidField("maxDepth")
    }
    guard request.payload.emitPolicy.batchMaxItems > 0 && request.payload.emitPolicy.batchMaxItems <= 20_000 else {
        throw ValidationError.invalidField("emitPolicy.batchMaxItems")
    }
    guard request.payload.emitPolicy.progressIntervalMs > 0 && request.payload.emitPolicy.progressIntervalMs <= 5_000 else {
        throw ValidationError.invalidField("emitPolicy.progressIntervalMs")
    }
    guard request.payload.plannedRoots.count >= 1 && request.payload.plannedRoots.count <= 256 else {
        throw ValidationError.invalidField("plannedRoots")
    }
    guard isAbsoluteNormalizedPath(request.payload.root) else {
        throw ValidationError.invalidField("root")
    }
    guard request.payload.plannedRoots.allSatisfy(isAbsoluteNormalizedPath) else {
        throw ValidationError.invalidField("plannedRoots")
    }

    let root = normalizePath(request.payload.root)
    let plannedRoots = request.payload.plannedRoots.map(normalizePath)

    guard plannedRoots.contains(root) else {
        throw ValidationError.rootOutsidePlannedRoots
    }
}

enum ValidationError: Error, CustomStringConvertible {
    case invalidField(String)
    case invalidSchemaVersion
    case unsupportedOperation
    case rootOutsidePlannedRoots

    var description: String {
        switch self {
        case .invalidField(let field):
            return "invalid helper field: \(field)"
        case .invalidSchemaVersion:
            return "unsupported helper schema version"
        case .unsupportedOperation:
            return "unsupported helper operation"
        case .rootOutsidePlannedRoots:
            return "root must be included in plannedRoots"
        }
    }
}

func validateId(_ value: String, field: String) throws {
    guard value.count >= 1 && value.count <= 128 else {
        throw ValidationError.invalidField(field)
    }
}

func isAbsoluteNormalizedPath(_ path: String) -> Bool {
    if path.isEmpty || path.count > 4096 || !path.hasPrefix("/") || path.contains("\0") || path.contains("//") {
        return false
    }

    let segments = path.split(separator: "/", omittingEmptySubsequences: false)
    return !segments.contains(".") && !segments.contains("..")
}

func normalizePath(_ path: String) -> String {
    var standardized = URL(fileURLWithPath: path).standardizedFileURL.path
    while standardized.count > 1 && standardized.hasSuffix("/") {
        standardized.removeLast()
    }
    return standardized
}

func decodeRequestId(from data: Data) -> String? {
    struct RequestIdOnly: Decodable {
        let requestId: String
    }

    return try? JSONDecoder().decode(RequestIdOnly.self, from: data).requestId
        .nilIfEmpty
}

extension String {
    var nilIfEmpty: String? {
        isEmpty ? nil : self
    }
}

func makeEntryItem(_ url: URL, attributes: [FileAttributeKey: Any]) throws -> [String: Any] {
    let values = try url.resourceValues(forKeys: [
        .contentModificationDateKey,
        .fileAllocatedSizeKey,
        .fileResourceIdentifierKey,
        .isDirectoryKey,
        .isRegularFileKey,
        .isSymbolicLinkKey,
        .totalFileAllocatedSizeKey,
    ])
    let kind: String
    if values.isDirectory == true {
        kind = "dir"
    } else if values.isRegularFile == true {
        kind = "file"
    } else if values.isSymbolicLink == true {
        kind = "symlink"
    } else {
        kind = "other"
    }

    return [
        "path": url.path,
        "parentPath": url.deletingLastPathComponent().path,
        "kind": kind,
        "size": UInt64(values.totalFileAllocatedSize ?? values.fileAllocatedSize ?? 0),
        "mtimeMs": values.contentModificationDate.map { $0.timeIntervalSince1970 * 1000.0 } as Any,
        "inode": values.fileResourceIdentifier.map { "\($0)" } as Any,
        "deviceId": deviceId(from: attributes) as Any,
        "estimated": false,
    ]
}

func deviceIdForPath(_ path: String) throws -> String? {
    let attributes = try FileManager.default.attributesOfItem(atPath: path)
    return deviceId(from: attributes)
}

func deviceId(from attributes: [FileAttributeKey: Any]) -> String? {
    if let systemNumber = attributes[.systemNumber] as? NSNumber {
        return systemNumber.stringValue
    }
    return nil
}

func isDirectory(_ attributes: [FileAttributeKey: Any]) -> Bool {
    attributes[.type] as? FileAttributeType == .typeDirectory
}

func depth(of absolutePath: String) -> Int {
    absolutePath.split(separator: "/").count
}

func emitEntryBatch(requestId: String, items: [[String: Any]]) {
    emit([
        "type": "entry_batch",
        "requestId": requestId,
        "items": items,
    ])
}

func emitProgress(requestId: String, scannedCount: Int, currentPath: String) {
    emit([
        "type": "progress",
        "requestId": requestId,
        "scannedCount": scannedCount,
        "currentPath": currentPath,
    ])
}

func emitCoverage(requestId: String, scannedCount: Int, permissionFailures: Int, ioFailures: Int, scopeFailures: Int) {
    emit([
        "type": "coverage",
        "requestId": requestId,
        "scannedCount": scannedCount,
        "permissionFailures": permissionFailures,
        "ioFailures": ioFailures,
        "scopeFailures": scopeFailures,
    ])
}

func emitDone(requestId: String) {
    let elapsedMs = Int(Date().timeIntervalSince(startedAt) * 1000)
    emit([
        "type": "done",
        "requestId": requestId,
        "estimated": false,
        "elapsedMs": elapsedMs,
    ])
}

func emitWarn(requestId: String, code: String, path: String, message: String) {
    emit([
        "type": "warn",
        "requestId": requestId,
        "code": code,
        "path": path,
        "message": message,
    ])
}

func emit(_ payload: [String: Any]) {
    guard
        JSONSerialization.isValidJSONObject(payload),
        let data = try? JSONSerialization.data(withJSONObject: payload, options: [.sortedKeys]),
        let output = String(data: data, encoding: .utf8)
    else {
        return
    }

    print(output)
    fflush(stdout)
}
