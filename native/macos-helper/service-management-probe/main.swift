import Foundation
import ServiceManagement

@available(macOS 13.0, *)
func emitServiceStatus() {
    let service = SMAppService.daemon(plistName: "com.example.diskvisualizer.privileged-helper.plist")

    switch service.status {
    case .enabled: emit(state: "registered", reason: "enabled")
    case .requiresApproval: emit(state: "pending-approval", reason: "requires-approval")
    case .notRegistered: emit(state: "not-installed", reason: "not-registered")
    case .notFound: emit(state: "not-installed", reason: "not-found")
    @unknown default: emit(state: "not-implemented", reason: "unknown-smappservice-status")
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
    emitServiceStatus()
} else {
    emit(state: "not-implemented", reason: "macos-13-required")
}
