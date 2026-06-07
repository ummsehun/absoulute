import Foundation

let helperMachServiceName = "com.example.diskvisualizer.privileged-helper"
let xpcTimeoutSeconds = 60

@objc(DiskVisualizerPrivilegedHelperProtocol)
protocol DiskVisualizerPrivilegedHelperProtocol {
    func enumerate(_ requestJson: String, withReply reply: @escaping (String) -> Void)
}

let input = FileHandle.standardInput.readDataToEndOfFile()

do {
    let requestJson = String(data: input, encoding: .utf8) ?? ""
    try validateRequestEnvelope(input)
    let eventLines = try runXpcEnumerateRequest(requestJson)
    writeStdout(eventLines)
} catch {
    let requestId = decodeRequestId(from: input) ?? "unknown"
    writeStdout(helperEvent([
        "type": "error",
        "requestId": requestId,
        "code": helperProtocolErrorCode(for: error),
        "message": boundedMessage("helper xpc enumerate request failed: \(error)"),
    ]))
    exit(1)
}

func runXpcEnumerateRequest(_ requestJson: String) throws -> String {
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
        state.resolve(.failure(XpcBridgeError.connectionInterrupted))
        semaphore.signal()
    }
    connection.invalidationHandler = {
        state.resolve(.failure(XpcBridgeError.connectionInvalidated))
        semaphore.signal()
    }
    connection.resume()

    guard let helper = connection.remoteObjectProxyWithErrorHandler({ error in
        state.resolve(.failure(error))
        semaphore.signal()
    }) as? DiskVisualizerPrivilegedHelperProtocol else {
        connection.invalidate()
        throw XpcBridgeError.remoteProxyUnavailable
    }

    helper.enumerate(requestJson) { response in
        state.resolve(.success(response))
        semaphore.signal()
    }

    if semaphore.wait(timeout: .now() + .seconds(xpcTimeoutSeconds)) == .timedOut {
        connection.invalidate()
        throw XpcBridgeError.timeout
    }

    connection.invalidate()
    switch state.result {
    case .success(let response):
        guard !response.isEmpty else {
            throw XpcBridgeError.emptyResponse
        }
        return response
    case .failure(let error):
        throw error
    case .none:
        throw XpcBridgeError.missingResponse
    }
}

func validateRequestEnvelope(_ data: Data) throws {
    let object = try JSONSerialization.jsonObject(with: data)
    guard let envelope = object as? [String: Any] else {
        throw ValidationError.invalidRequest
    }
    guard envelope["operation"] as? String == "scan.enumerate" else {
        throw ValidationError.unsupportedOperation
    }
    guard let requestId = envelope["requestId"] as? String,
          requestId.count >= 1,
          requestId.count <= 128
    else {
        throw ValidationError.invalidRequestId
    }
}

func decodeRequestId(from data: Data) -> String? {
    guard
        let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
        let requestId = object["requestId"] as? String,
        requestId.count >= 1,
        requestId.count <= 128
    else {
        return nil
    }
    return requestId
}

func helperProtocolErrorCode(for error: Error) -> String {
    switch error {
    case is ValidationError, is DecodingError:
        return "E_INVALID_REQUEST"
    default:
        return "E_HELPER_INTERNAL"
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

func boundedMessage(_ message: String) -> String {
    String(message.prefix(2048))
}

func writeStdout(_ text: String) {
    let output = text.hasSuffix("\n") ? text : "\(text)\n"
    if let data = output.data(using: .utf8) {
        FileHandle.standardOutput.write(data)
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
    case invalidRequest
    case invalidRequestId
    case unsupportedOperation

    var description: String {
        switch self {
        case .invalidRequest:
            return "invalid helper request"
        case .invalidRequestId:
            return "invalid requestId"
        case .unsupportedOperation:
            return "unsupported operation"
        }
    }
}

enum XpcBridgeError: Error, CustomStringConvertible {
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
            return "xpc enumerate response was empty"
        case .missingResponse:
            return "xpc enumerate response was missing"
        case .remoteProxyUnavailable:
            return "xpc remote proxy unavailable"
        case .timeout:
            return "xpc enumerate request timed out"
        }
    }
}
