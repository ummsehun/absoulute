import Foundation

struct HelperRequest: Decodable {
    let requestId: String
    let payload: Payload
}

struct Payload: Decodable {
    let root: String
    let maxDepth: Int
    let emitPolicy: EmitPolicy
}

struct EmitPolicy: Decodable {
    let batchMaxItems: Int
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
    emit([
        "type": "ready",
        "requestId": request.requestId,
        "helperVersion": "dev-enumerate-0.1.0",
    ])
    try enumerate(request)
} catch {
    emit([
        "type": "error",
        "requestId": "unknown",
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
        options: [.skipsPackageDescendants],
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
        emitCoverage(requestId: request.requestId, permissionFailures: permissionFailures, ioFailures: 1)
        emitDone(requestId: request.requestId)
        return
    }

    for case let url as URL in enumerator {
        if depth(of: url.path) - rootDepth > request.payload.maxDepth {
            enumerator.skipDescendants()
            continue
        }

        do {
            let item = try makeEntryItem(url)
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
    emitCoverage(requestId: request.requestId, permissionFailures: permissionFailures, ioFailures: ioFailures)
    emitDone(requestId: request.requestId)
}

func makeEntryItem(_ url: URL) throws -> [String: Any] {
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
        "deviceId": "unknown",
        "estimated": false,
    ]
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

func emitCoverage(requestId: String, permissionFailures: Int, ioFailures: Int) {
    emit([
        "type": "coverage",
        "requestId": requestId,
        "permissionFailures": permissionFailures,
        "ioFailures": ioFailures,
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
