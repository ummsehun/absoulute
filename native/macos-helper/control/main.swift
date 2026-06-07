import Foundation

let helperMachServiceName = "com.example.diskvisualizer.privileged-helper"
let startedAt = Date()
let xpcTimeoutSeconds = 15

@objc(DiskVisualizerPrivilegedHelperProtocol)
protocol DiskVisualizerPrivilegedHelperProtocol {
    func healthCheck(_ reply: @escaping (String) -> Void)
    func getVersion(_ reply: @escaping (String) -> Void)
}

struct HelperControlRequest: Decodable {
    let schemaVersion: Int
    let requestId: String
    let scanId: String
    let stageId: String
    let operation: String
    let issuedAtMs: Int
    let nonce: String
    let payload: EmptyPayload

    enum CodingKeys: String, CodingKey, CaseIterable {
        case schemaVersion
        case requestId
        case scanId
        case stageId
        case operation
        case issuedAtMs
        case nonce
        case payload
    }

    init(from decoder: Decoder) throws {
        try rejectUnknownFields(
            decoder,
            allowedKeys: CodingKeys.allCases.map(\.rawValue),
            objectName: "request"
        )
        let container = try decoder.container(keyedBy: CodingKeys.self)
        schemaVersion = try container.decode(Int.self, forKey: .schemaVersion)
        requestId = try container.decode(String.self, forKey: .requestId)
        scanId = try container.decode(String.self, forKey: .scanId)
        stageId = try container.decode(String.self, forKey: .stageId)
        operation = try container.decode(String.self, forKey: .operation)
        issuedAtMs = try container.decode(Int.self, forKey: .issuedAtMs)
        nonce = try container.decode(String.self, forKey: .nonce)
        payload = try container.decode(EmptyPayload.self, forKey: .payload)
    }
}

struct EmptyPayload: Decodable {
    init(from decoder: Decoder) throws {
        try rejectUnknownFields(
            decoder,
            allowedKeys: [],
            objectName: "payload"
        )
    }
}

let input = FileHandle.standardInput.readDataToEndOfFile()

do {
    let request = try JSONDecoder().decode(HelperControlRequest.self, from: input)
    try validateRequest(request)
    let helperVersion = try runXpcControlRequest(request)
    emit([
        "type": "ready",
        "requestId": request.requestId,
        "helperVersion": helperVersion,
    ])
    emit([
        "type": "done",
        "requestId": request.requestId,
        "estimated": false,
        "elapsedMs": elapsedMs(),
    ])
} catch {
    let requestId = decodeRequestId(from: input) ?? "unknown"
    emit([
        "type": "error",
        "requestId": requestId,
        "code": helperProtocolErrorCode(for: error),
        "message": "helper xpc control request failed: \(error)",
    ])
    exit(1)
}

func runXpcControlRequest(_ request: HelperControlRequest) throws -> String {
    let connection = NSXPCConnection(
        machServiceName: helperMachServiceName,
        options: .privileged
    )
    connection.remoteObjectInterface = NSXPCInterface(
        with: DiskVisualizerPrivilegedHelperProtocol.self
    )

    let semaphore = DispatchSemaphore(value: 0)
    let state = XpcReplyState()
    connection.interruptionHandler = {
        state.resolve(.failure(XpcProbeError.connectionInterrupted))
        semaphore.signal()
    }
    connection.invalidationHandler = {
        state.resolve(.failure(XpcProbeError.connectionInvalidated))
        semaphore.signal()
    }
    connection.resume()

    guard let helper = connection.remoteObjectProxyWithErrorHandler({ error in
        state.resolve(.failure(error))
        semaphore.signal()
    }) as? DiskVisualizerPrivilegedHelperProtocol else {
        connection.invalidate()
        throw XpcProbeError.remoteProxyUnavailable
    }

    switch request.operation {
    case "health.check":
        helper.healthCheck { response in
            state.resolve(.success(response))
            semaphore.signal()
        }
    case "version.get":
        helper.getVersion { response in
            state.resolve(.success(response))
            semaphore.signal()
        }
    default:
        connection.invalidate()
        throw ValidationError.unsupportedOperation
    }

    if semaphore.wait(timeout: .now() + .seconds(xpcTimeoutSeconds)) == .timedOut {
        connection.invalidate()
        throw XpcProbeError.timeout
    }

    connection.invalidate()
    switch state.result {
    case .success(let response):
        guard !response.isEmpty else {
            throw XpcProbeError.emptyResponse
        }
        return response
    case .failure(let error):
        throw error
    case .none:
        throw XpcProbeError.missingResponse
    }
}

func validateRequest(_ request: HelperControlRequest) throws {
    guard request.schemaVersion == 1 else {
        throw ValidationError.invalidSchemaVersion
    }
    guard !request.requestId.isEmpty && request.requestId.count <= 128 else {
        throw ValidationError.invalidRequestId
    }
    guard !request.scanId.isEmpty && request.scanId.count <= 128 else {
        throw ValidationError.invalidScanId
    }
    guard !request.stageId.isEmpty && request.stageId.count <= 128 else {
        throw ValidationError.invalidStageId
    }
    guard request.operation == "health.check" || request.operation == "version.get" else {
        throw ValidationError.unsupportedOperation
    }
    guard request.issuedAtMs > 0 else {
        throw ValidationError.invalidIssuedAt
    }
    guard request.nonce.count >= 16 && request.nonce.count <= 256 else {
        throw ValidationError.invalidNonce
    }
}

func rejectUnknownFields(
    _ decoder: Decoder,
    allowedKeys: [String],
    objectName: String
) throws {
    let container = try decoder.container(keyedBy: DynamicCodingKey.self)
    let allowed = Set(allowedKeys)
    for key in container.allKeys where !allowed.contains(key.stringValue) {
        throw ValidationError.unknownField("\(objectName).\(key.stringValue)")
    }
}

func emit(_ object: [String: Any]) {
    if let data = try? JSONSerialization.data(withJSONObject: object, options: []),
       let line = String(data: data, encoding: .utf8) {
        print(line)
        fflush(stdout)
    }
}

func elapsedMs() -> Int {
    Int(Date().timeIntervalSince(startedAt) * 1000)
}

func decodeRequestId(from data: Data) -> String? {
    guard let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
        return nil
    }
    return object["requestId"] as? String
}

func helperProtocolErrorCode(for error: Error) -> String {
    switch error {
    case is ValidationError, is DecodingError:
        return "E_INVALID_REQUEST"
    default:
        return "E_HELPER_INTERNAL"
    }
}

final class XpcReplyState {
    private let lock = NSLock()
    private(set) var result: Result<String, Error>?

    func resolve(_ value: Result<String, Error>) {
        lock.lock()
        defer { lock.unlock() }
        if result == nil {
            result = value
        }
    }
}

enum ValidationError: Error, CustomStringConvertible {
    case invalidSchemaVersion
    case invalidRequestId
    case invalidScanId
    case invalidStageId
    case unsupportedOperation
    case invalidIssuedAt
    case invalidNonce
    case unknownField(String)

    var description: String {
        switch self {
        case .invalidSchemaVersion:
            return "invalid schemaVersion"
        case .invalidRequestId:
            return "invalid requestId"
        case .invalidScanId:
            return "invalid scanId"
        case .invalidStageId:
            return "invalid stageId"
        case .unsupportedOperation:
            return "unsupported operation"
        case .invalidIssuedAt:
            return "invalid issuedAtMs"
        case .invalidNonce:
            return "invalid nonce"
        case .unknownField(let field):
            return "unknown field \(field)"
        }
    }
}

enum XpcProbeError: Error, CustomStringConvertible {
    case connectionInterrupted
    case connectionInvalidated
    case emptyResponse
    case missingResponse
    case remoteProxyUnavailable
    case timeout

    var description: String {
        switch self {
        case .connectionInterrupted:
            return "xpc connection interrupted"
        case .connectionInvalidated:
            return "xpc connection invalidated"
        case .emptyResponse:
            return "xpc control response was empty"
        case .missingResponse:
            return "xpc control response was missing"
        case .remoteProxyUnavailable:
            return "xpc remote proxy unavailable"
        case .timeout:
            return "xpc control request timed out"
        }
    }
}

struct DynamicCodingKey: CodingKey {
    let stringValue: String
    let intValue: Int?

    init?(stringValue: String) {
        self.stringValue = stringValue
        intValue = nil
    }

    init?(intValue: Int) {
        stringValue = String(intValue)
        self.intValue = intValue
    }
}
