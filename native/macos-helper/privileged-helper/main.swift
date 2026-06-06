import Foundation

let helperMachServiceName = "com.example.diskvisualizer.privileged-helper"
let expectedClientTeamId = "TEAMID_NOT_CONFIGURED"
let allowedClientRequirement = #"identifier "com.example.diskvisualizer" and anchor apple generic and certificate leaf[subject.OU] = "\#(expectedClientTeamId)""#

final class HelperListenerDelegate: NSObject, NSXPCListenerDelegate {
    func listener(
        _ listener: NSXPCListener,
        shouldAcceptNewConnection newConnection: NSXPCConnection
    ) -> Bool {
        newConnection.invalidate()
        return false
    }
}

let listener = NSXPCListener(machServiceName: helperMachServiceName)
let delegate = HelperListenerDelegate()
listener.delegate = delegate
listener.setConnectionCodeSigningRequirement(allowedClientRequirement)
listener.resume()

RunLoop.current.run()
