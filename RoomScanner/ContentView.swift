import SwiftUI
import RoomPlan

struct ContentView: View {
    @State private var showScanner = false
    @State private var showShareSheet = false
    @State private var shareURL: URL?
    @State private var errorMessage: String?
    @State private var isUploading = false

    /// RoomCaptureSession.isSupported is false on any device without a LiDAR
    /// scanner (and always false in the Simulator).
    private var isSupported: Bool { RoomCaptureSession.isSupported }

    var body: some View {
        VStack(spacing: 24) {
            Image(systemName: "cube.transparent")
                .font(.system(size: 64))
                .foregroundStyle(.tint)

            Text("Room Scanner")
                .font(.largeTitle.bold())

            if isSupported {
                Text("Scan a room with LiDAR and open it in your 3D room editor.")
                    .multilineTextAlignment(.center)
                    .foregroundStyle(.secondary)

                Button("Scan Room") {
                    showScanner = true
                }
                .buttonStyle(.borderedProminent)
                .controlSize(.large)
            } else {
                Text("This device doesn't have a LiDAR scanner.\nUse an iPhone 12 Pro (or later Pro model) or an iPad Pro (2020 or later).")
                    .multilineTextAlignment(.center)
                    .foregroundStyle(.secondary)
            }

            if isUploading {
                ProgressView("Uploading to room…")
            }

            if let errorMessage {
                Text(errorMessage)
                    .foregroundStyle(.red)
                    .font(.footnote)
                    .multilineTextAlignment(.center)
            }
        }
        .padding()
        .fullScreenCover(isPresented: $showScanner) {
            RoomScanView(
                onFinish: { room in
                    showScanner = false
                    export(room)
                },
                onCancel: {
                    showScanner = false
                }
            )
        }
        .sheet(isPresented: $showShareSheet) {
            if let shareURL {
                ShareSheet(activityItems: [shareURL])
            }
        }
    }

    private func export(_ room: CapturedRoom) {
        errorMessage = nil
        isUploading = true

        Task {
            do {
                let layout = RoomExporter.buildLayout(from: room)
                let session = UUID().uuidString
                try await LayoutUploader.upload(layout, session: session)
                let url = LayoutUploader.shareableRoomURL(session: session)

                await MainActor.run {
                    isUploading = false
                    shareURL = url
                }
                // Give the fullScreenCover a moment to finish dismissing
                // before presenting the share sheet, otherwise SwiftUI can
                // drop it.
                try? await Task.sleep(nanoseconds: 300_000_000)
                await MainActor.run {
                    showShareSheet = true
                }
            } catch {
                await MainActor.run {
                    isUploading = false
                    errorMessage = "Upload failed: \(error.localizedDescription)"
                }
            }
        }
    }
}
