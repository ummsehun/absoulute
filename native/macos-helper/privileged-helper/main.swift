import Foundation

let helperMachServiceName = "com.example.diskvisualizer.privileged-helper"
let expectedClientTeamId = "TEAMID_NOT_CONFIGURED"
let allowedClientRequirement = #"identifier "com.example.diskvisualizer" and anchor apple generic and certificate leaf[subject.OU] = "\#(expectedClientTeamId)""#
let helperVersion = "dev-privileged-helper-0.1.0"

@objc(DiskVisualizerPrivilegedHelperProtocol)
protocol DiskVisualizerPrivilegedHelperProtocol {
    func healthCheck(_ reply: @escaping (String) -> Void)
    func getVersion(_ reply: @escaping (String) -> Void)
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
