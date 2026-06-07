import Foundation

func enumeratePrivileged(_ request: HelperEnumerateRequest) throws -> [String] {
    let root = URL(fileURLWithPath: request.payload.root, isDirectory: true)
    let rootDepth = pathDepth(root.path)
    let counters = PrivilegedEnumerateCounters()
    let startedAt = Date()
    var events: [String] = []
    var batch: [[String: Any]] = []
    let rootDeviceId: String?

    do {
        rootDeviceId = try deviceIdForPath(root.path)
    } catch {
        counters.ioFailures += 1
        events.append(warnEvent(
            requestId: request.requestId,
            code: "E_IO",
            path: root.path,
            message: error.localizedDescription
        ))
        events.append(coverageEvent(requestId: request.requestId, counters: counters))
        events.append(doneEvent(requestId: request.requestId, startedAt: startedAt))
        return events
    }

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
            counters.permissionFailures += 1
            events.append(warnEvent(
                requestId: request.requestId,
                code: "E_HELPER_PERMISSION",
                path: url.path,
                message: error.localizedDescription
            ))
            return true
        }
    ) else {
        counters.ioFailures += 1
        events.append(warnEvent(
            requestId: request.requestId,
            code: "E_IO",
            path: root.path,
            message: "failed to create directory enumerator"
        ))
        events.append(coverageEvent(requestId: request.requestId, counters: counters))
        events.append(doneEvent(requestId: request.requestId, startedAt: startedAt))
        return events
    }

    for case let url as URL in enumerator {
        if pathDepth(url.path) - rootDepth > request.payload.maxDepth {
            enumerator.skipDescendants()
            continue
        }

        do {
            let attributes = try FileManager.default.attributesOfItem(atPath: url.path)
            let itemDeviceId = deviceId(from: attributes)
            if request.payload.sameDeviceOnly && rootDeviceId != nil && itemDeviceId != rootDeviceId {
                counters.scopeFailures += 1
                events.append(warnEvent(
                    requestId: request.requestId,
                    code: "E_SCOPE",
                    path: url.path,
                    message: "skipped cross-device entry"
                ))
                if isDirectory(attributes) {
                    enumerator.skipDescendants()
                }
                continue
            }

            batch.append(try entryItem(url, attributes: attributes))
            counters.scannedCount += 1
        } catch {
            counters.ioFailures += 1
            events.append(warnEvent(
                requestId: request.requestId,
                code: "E_IO",
                path: url.path,
                message: error.localizedDescription
            ))
        }

        if batch.count >= max(1, request.payload.emitPolicy.batchMaxItems) {
            events.append(entryBatchEvent(requestId: request.requestId, items: batch))
            batch.removeAll(keepingCapacity: true)
            events.append(progressEvent(
                requestId: request.requestId,
                scannedCount: counters.scannedCount,
                currentPath: url.path
            ))
        }
    }

    if !batch.isEmpty {
        events.append(entryBatchEvent(requestId: request.requestId, items: batch))
    }
    events.append(progressEvent(
        requestId: request.requestId,
        scannedCount: counters.scannedCount,
        currentPath: root.path
    ))
    events.append(coverageEvent(requestId: request.requestId, counters: counters))
    events.append(doneEvent(requestId: request.requestId, startedAt: startedAt))
    return events
}

final class PrivilegedEnumerateCounters {
    var scannedCount = 0
    var permissionFailures = 0
    var ioFailures = 0
    var scopeFailures = 0
}

func entryItem(_ url: URL, attributes: [FileAttributeKey: Any]) throws -> [String: Any] {
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

    var item: [String: Any] = [
        "path": url.path,
        "parentPath": url.deletingLastPathComponent().path,
        "kind": kind,
        "size": UInt64(values.totalFileAllocatedSize ?? values.fileAllocatedSize ?? 0),
        "estimated": false,
    ]
    if let modificationDate = values.contentModificationDate {
        item["mtimeMs"] = modificationDate.timeIntervalSince1970 * 1000.0
    }
    if let resourceIdentifier = values.fileResourceIdentifier {
        item["inode"] = "\(resourceIdentifier)"
    }
    if let entryDeviceId = deviceId(from: attributes) {
        item["deviceId"] = entryDeviceId
    }
    return item
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

func pathDepth(_ absolutePath: String) -> Int {
    absolutePath.split(separator: "/").count
}

func entryBatchEvent(requestId: String, items: [[String: Any]]) -> String {
    helperEvent([
        "type": "entry_batch",
        "requestId": requestId,
        "items": items,
    ])
}

func progressEvent(requestId: String, scannedCount: Int, currentPath: String) -> String {
    helperEvent([
        "type": "progress",
        "requestId": requestId,
        "scannedCount": scannedCount,
        "currentPath": currentPath,
    ])
}

func coverageEvent(requestId: String, counters: PrivilegedEnumerateCounters) -> String {
    helperEvent([
        "type": "coverage",
        "requestId": requestId,
        "scannedCount": counters.scannedCount,
        "permissionFailures": counters.permissionFailures,
        "ioFailures": counters.ioFailures,
        "scopeFailures": counters.scopeFailures,
    ])
}

func doneEvent(requestId: String, startedAt: Date) -> String {
    helperEvent([
        "type": "done",
        "requestId": requestId,
        "estimated": false,
        "elapsedMs": Int(Date().timeIntervalSince(startedAt) * 1000),
    ])
}

func warnEvent(requestId: String, code: String, path: String, message: String) -> String {
    helperEvent([
        "type": "warn",
        "requestId": requestId,
        "code": code,
        "path": path,
        "message": message,
    ])
}
