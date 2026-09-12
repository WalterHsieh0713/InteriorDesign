import SwiftUI
import Combine

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

/// Carries the session ID in from a `roomscanner://scan?session=<id>` deep
/// link — the QR code the web app shows when the user clicks "Scan with
/// LiDAR". Lets the finished scan upload into the exact browser session that
/// is already polling for it, so the browser navigates automatically instead
/// of making the user copy a share-sheet URL back to their computer.
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
