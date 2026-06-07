import Foundation

let helperMachServiceName = "com.example.diskvisualizer.privileged-helper"
let expectedClientTeamId = "TEAMID_NOT_CONFIGURED"
let allowedClientRequirement = #"identifier "com.example.diskvisualizer" and anchor apple generic and certificate leaf[subject.OU] = "\#(expectedClientTeamId)""#
let helperVersion = "dev-privileged-helper-0.1.0"

@objc(DiskVisualizerPrivilegedHelperProtocol)
protocol DiskVisualizerPrivilegedHelperProtocol {
    func healthCheck(_ reply: @escaping (String) -> Void)
    func getVersion(_ reply: @escaping (String) -> Void)
    func enumerate(_ requestJson: String, withReply reply: @escaping (String) -> Void)
}

final class DiskVisualizerPrivilegedHelperService:
    NSObject,
    DiskVisualizerPrivilegedHelperProtocol
{
    func healthCheck(_ reply: @escaping (String) -> Void) {
        reply("ok")
    }

    func getVersion(_ reply: @escaping (String) -> Void) {
        reply(helperVersion)
    }

    func enumerate(_ requestJson: String, withReply reply: @escaping (String) -> Void) {
        do {
            let data = Data(requestJson.utf8)
            let request = try JSONDecoder().decode(HelperEnumerateRequest.self, from: data)
            try validateEnumerateRequest(request)
            let traversalEvents = try enumeratePrivileged(request)
            reply(joinEvents([
                helperEvent([
                    "type": "ready",
                    "requestId": request.requestId,
                    "helperVersion": helperVersion,
                ]),
            ] + traversalEvents))
        } catch {
            let requestId = decodeRequestId(from: Data(requestJson.utf8)) ?? "unknown"
            reply(joinEvents([
                helperEvent([
                    "type": "error",
                    "requestId": requestId,
                    "code": "E_INVALID_REQUEST",
                    "message": "invalid privileged helper enumerate request: \(error)",
                ]),
            ]))
        }
    }
}

struct HelperEnumerateRequest: Decodable {
    let schemaVersion: Int
    let requestId: String
    let scanId: String
    let stageId: String
    let operation: String
    let issuedAtMs: Int
    let nonce: String
    let payload: HelperEnumeratePayload

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
        payload = try container.decode(HelperEnumeratePayload.self, forKey: .payload)
    }
}

struct HelperEnumeratePayload: Decodable {
    let root: String
    let scanMode: String
    let accuracyMode: String
    let volumePolicy: String
    let plannedRoots: [String]
    let maxDepth: Int
    let sameDeviceOnly: Bool
    let permissionPolicy: String
    let traversalPolicyPlanId: String
    let emitPolicy: HelperEmitPolicy

    enum CodingKeys: String, CodingKey, CaseIterable {
        case root
        case scanMode
        case accuracyMode
        case volumePolicy
        case plannedRoots
        case maxDepth
        case sameDeviceOnly
        case permissionPolicy
        case traversalPolicyPlanId
        case emitPolicy
    }

    init(from decoder: Decoder) throws {
        try rejectUnknownFields(
            decoder,
            allowedKeys: CodingKeys.allCases.map(\.rawValue),
            objectName: "payload"
        )
        let container = try decoder.container(keyedBy: CodingKeys.self)
        root = try container.decode(String.self, forKey: .root)
        scanMode = try container.decode(String.self, forKey: .scanMode)
        accuracyMode = try container.decode(String.self, forKey: .accuracyMode)
        volumePolicy = try container.decode(String.self, forKey: .volumePolicy)
        plannedRoots = try container.decode([String].self, forKey: .plannedRoots)
        maxDepth = try container.decode(Int.self, forKey: .maxDepth)
        sameDeviceOnly = try container.decode(Bool.self, forKey: .sameDeviceOnly)
        permissionPolicy = try container.decode(String.self, forKey: .permissionPolicy)
        traversalPolicyPlanId = try container.decode(String.self, forKey: .traversalPolicyPlanId)
        emitPolicy = try container.decode(HelperEmitPolicy.self, forKey: .emitPolicy)
    }
}

struct HelperEmitPolicy: Decodable {
    let batchMaxItems: Int
    let progressIntervalMs: Int

    enum CodingKeys: String, CodingKey, CaseIterable {
        case batchMaxItems
        case progressIntervalMs
    }

    init(from decoder: Decoder) throws {
        try rejectUnknownFields(
            decoder,
            allowedKeys: CodingKeys.allCases.map(\.rawValue),
            objectName: "emitPolicy"
        )
        let container = try decoder.container(keyedBy: CodingKeys.self)
        batchMaxItems = try container.decode(Int.self, forKey: .batchMaxItems)
        progressIntervalMs = try container.decode(Int.self, forKey: .progressIntervalMs)
    }
}

func validateEnumerateRequest(_ request: HelperEnumerateRequest) throws {
    guard request.schemaVersion == 1 else {
        throw HelperEnumerateValidationError.invalidSchemaVersion
    }
    try validateId(request.requestId, field: "requestId")
    try validateId(request.scanId, field: "scanId")
    try validateId(request.stageId, field: "stageId")
    guard request.issuedAtMs > 0 else {
        throw HelperEnumerateValidationError.invalidField("issuedAtMs")
    }
    guard request.nonce.count >= 16 && request.nonce.count <= 256 else {
        throw HelperEnumerateValidationError.invalidField("nonce")
    }
    guard request.operation == "scan.enumerate" else {
        throw HelperEnumerateValidationError.unsupportedOperation
    }
    guard request.payload.scanMode == "quick" || request.payload.scanMode == "deep" else {
        throw HelperEnumerateValidationError.invalidField("scanMode")
    }
    guard request.payload.accuracyMode == "preview" || request.payload.accuracyMode == "full" else {
        throw HelperEnumerateValidationError.invalidField("accuracyMode")
    }
    guard ["same-device", "root-cross-device", "explicit-volumes"].contains(request.payload.volumePolicy) else {
        throw HelperEnumerateValidationError.invalidField("volumePolicy")
    }
    if request.payload.volumePolicy == "root-cross-device" && request.payload.sameDeviceOnly {
        throw HelperEnumerateValidationError.invalidField("sameDeviceOnly")
    }
    if request.payload.volumePolicy != "root-cross-device" && !request.payload.sameDeviceOnly {
        throw HelperEnumerateValidationError.invalidField("sameDeviceOnly")
    }
    guard request.payload.permissionPolicy == "report-only" else {
        throw HelperEnumerateValidationError.invalidField("permissionPolicy")
    }
    try validateId(request.payload.traversalPolicyPlanId, field: "traversalPolicyPlanId")
    guard request.payload.maxDepth >= 0 && request.payload.maxDepth <= 512 else {
        throw HelperEnumerateValidationError.invalidField("maxDepth")
    }
    guard request.payload.emitPolicy.batchMaxItems > 0 && request.payload.emitPolicy.batchMaxItems <= 20_000 else {
        throw HelperEnumerateValidationError.invalidField("emitPolicy.batchMaxItems")
    }
    guard request.payload.emitPolicy.progressIntervalMs > 0 && request.payload.emitPolicy.progressIntervalMs <= 5_000 else {
        throw HelperEnumerateValidationError.invalidField("emitPolicy.progressIntervalMs")
    }
    guard request.payload.plannedRoots.count >= 1 && request.payload.plannedRoots.count <= 256 else {
        throw HelperEnumerateValidationError.invalidField("plannedRoots")
    }
    guard isAbsoluteNormalizedPath(request.payload.root) else {
        throw HelperEnumerateValidationError.invalidField("root")
    }
    guard request.payload.plannedRoots.allSatisfy(isAbsoluteNormalizedPath) else {
        throw HelperEnumerateValidationError.invalidField("plannedRoots")
    }

    guard request.payload.plannedRoots.contains(request.payload.root) else {
        throw HelperEnumerateValidationError.rootOutsidePlannedRoots
    }
}

func validateId(_ value: String, field: String) throws {
    guard value.count >= 1 && value.count <= 128 else {
        throw HelperEnumerateValidationError.invalidField(field)
    }
}

func isAbsoluteNormalizedPath(_ path: String) -> Bool {
    if path.isEmpty || path.count > 4096 || !path.hasPrefix("/") || path.contains("\0") || path.contains("//") {
        return false
    }

    let segments = path.split(separator: "/", omittingEmptySubsequences: false)
    return !segments.contains(".") && !segments.contains("..")
}

func decodeRequestId(from data: Data) -> String? {
    struct RequestIdOnly: Decodable {
        let requestId: String
    }

    let requestId = try? JSONDecoder().decode(RequestIdOnly.self, from: data).requestId
    guard let requestId, requestId.count >= 1 && requestId.count <= 128 else {
        return nil
    }
    return requestId
}

func rejectUnknownFields(
    _ decoder: Decoder,
    allowedKeys: [String],
    objectName: String
) throws {
    let allowed = Set(allowedKeys)
    let container = try decoder.container(keyedBy: HelperAnyCodingKey.self)
    let unknownKeys = container.allKeys
        .map(\.stringValue)
        .filter { !allowed.contains($0) }

    if let unknownKey = unknownKeys.first {
        throw HelperEnumerateValidationError.invalidField("\(objectName).\(unknownKey)")
    }
}

func helperEvent(_ payload: [String: Any]) -> String {
    guard
        JSONSerialization.isValidJSONObject(payload),
        let data = try? JSONSerialization.data(withJSONObject: payload, options: [.sortedKeys]),
        let output = String(data: data, encoding: .utf8)
    else {
        return #"{"code":"E_HELPER_INTERNAL","message":"failed to encode helper event","requestId":"unknown","type":"error"}"#
    }
    return output
}

func joinEvents(_ events: [String]) -> String {
    events.joined(separator: "\n")
}

enum HelperEnumerateValidationError: Error, CustomStringConvertible {
    case invalidField(String)
    case invalidSchemaVersion
    case rootOutsidePlannedRoots
    case unsupportedOperation

    var description: String {
        switch self {
        case .invalidField(let field):
            return "invalid helper field: \(field)"
        case .invalidSchemaVersion:
            return "unsupported helper schema version"
        case .rootOutsidePlannedRoots:
            return "rootOutsidePlannedRoots"
        case .unsupportedOperation:
            return "unsupported helper operation"
        }
    }
}

struct HelperAnyCodingKey: CodingKey {
    let stringValue: String
    let intValue: Int?

    init?(stringValue: String) {
        self.stringValue = stringValue
        intValue = nil
    }

    init?(intValue: Int) {
        stringValue = "\(intValue)"
        self.intValue = intValue
    }
}

final class HelperListenerDelegate: NSObject, NSXPCListenerDelegate {
    private let service = DiskVisualizerPrivilegedHelperService()

    func listener(
        _ listener: NSXPCListener,
        shouldAcceptNewConnection newConnection: NSXPCConnection
    ) -> Bool {
        if expectedClientTeamId == "TEAMID_NOT_CONFIGURED" {
            newConnection.invalidate()
            return false
        }

        newConnection.exportedInterface = NSXPCInterface(
            with: DiskVisualizerPrivilegedHelperProtocol.self
        )
        newConnection.exportedObject = service
        newConnection.resume()
        return true
    }
}

let listener = NSXPCListener(machServiceName: helperMachServiceName)
let delegate = HelperListenerDelegate()
listener.delegate = delegate
listener.setConnectionCodeSigningRequirement(allowedClientRequirement)
listener.resume()

RunLoop.current.run()
