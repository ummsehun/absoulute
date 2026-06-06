import Foundation
import ServiceManagement

@available(macOS 13.0, *)
func runServiceCommand(_ command: String) {
    let service = SMAppService.daemon(plistName: "com.example.diskvisualizer.privileged-helper.plist")

    do {
        switch command {
        case "status":
            emitServiceStatus(service)
        case "register":
            try service.register()
            emit(state: serviceState(service.status), reason: "register-succeeded")
        case "unregister":
            try service.unregister()
            emit(state: serviceState(service.status), reason: "unregister-succeeded")
        default:
            emit(state: "not-implemented", reason: "unsupported-command")
            exit(2)
        }
    } catch {
        emit(state: serviceState(service.status), reason: "\(command)-failed:\(error.localizedDescription)")
        exit(1)
    }
}

@available(macOS 13.0, *)
func emitServiceStatus(_ service: SMAppService) {
    switch service.status {
    case .enabled: emit(state: "registered", reason: "enabled")
    case .requiresApproval: emit(state: "pending-approval", reason: "requires-approval")
    case .notRegistered: emit(state: "not-installed", reason: "not-registered")
    case .notFound: emit(state: "not-installed", reason: "not-found")
    @unknown default: emit(state: "not-implemented", reason: "unknown-smappservice-status")
    }
}

@available(macOS 13.0, *)
func serviceState(_ status: SMAppService.Status) -> String {
    switch status {
    case .enabled: return "registered"
    case .requiresApproval: return "pending-approval"
    case .notRegistered: return "not-installed"
    case .notFound: return "not-installed"
    @unknown default: return "not-implemented"
    }
}

func emit(state: String, reason: String) {
    let payload: [String: String] = [
        "state": state,
        "reason": reason,
    ]

    guard
        let data = try? JSONSerialization.data(withJSONObject: payload, options: [.sortedKeys]),
        let output = String(data: data, encoding: .utf8)
    else {
        print("{\"reason\":\"json-encoding-failed\",\"state\":\"not-implemented\"}")
        return
    }

    print(output)
}

if #available(macOS 13.0, *) {
    let command = CommandLine.arguments.dropFirst().first ?? "status"
    runServiceCommand(command)
} else {
    emit(state: "not-implemented", reason: "macos-13-required")
}
