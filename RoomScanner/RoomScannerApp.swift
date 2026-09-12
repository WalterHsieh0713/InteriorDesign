import SwiftUI

@main
struct RoomScannerApp: App {
    @StateObject private var deepLink = DeepLinkSession()

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(deepLink)
                .onOpenURL { url in
                    deepLink.handle(url)
                }
        }
    }
}

/// Carries a session ID in from a `roomscanner://scan?session=<id>` link —
/// the QR code the web app's "Scan with LiDAR" button shows. Lets a finished
/// scan upload straight into the browser session that's already waiting and
/// polling for it, instead of generating its own ID and making the user
/// copy a share-sheet URL back to their computer by hand.
///
/// Requires registering the `roomscanner` URL scheme in Xcode: select the
/// RoomScanner target, Info tab, "URL Types", "+", set Identifier to this
/// app's bundle ID and URL Schemes to `roomscanner`. This project has no
/// checked-in Info.plist (see Info-additions.plist) so that step can't be
/// done from a file — it has to happen in Xcode's UI.
final class DeepLinkSession: ObservableObject {
    @Published var pendingSessionId: String?

    func handle(_ url: URL) {
        guard let components = URLComponents(url: url, resolvingAgainstBaseURL: false),
              let session = components.queryItems?.first(where: { $0.name == "session" })?.value,
              !session.isEmpty
        else { return }
        pendingSessionId = session
    }
}
