import SwiftUI
import RoomPlan

struct ContentView: View {
    @State private var showScanner = false
    @State private var showShareSheet = false
    @State private var shareURL: URL?
    @State private var errorMessage: String?
    @State private var isUploading = false
    @State private var uploadStage = "Uploading..."
    @State private var diagnostics: String?

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
                ProgressView(uploadStage)
            }

            if let errorMessage {
                Text(errorMessage)
                    .foregroundStyle(.red)
                    .font(.footnote)
                    .multilineTextAlignment(.center)
            }

            if let diagnostics {
                ScrollView {
                    Text(diagnostics)
                        .font(.system(.caption2, design: .monospaced))
                        .textSelection(.enabled)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
                .frame(maxHeight: 220)
                .padding(8)
                .background(Color.gray.opacity(0.12))
                .clipShape(RoundedRectangle(cornerRadius: 8))
            }
        }
        .padding()
        .fullScreenCover(isPresented: $showScanner) {
            RoomScanView(
                onFinish: { room, frames in
                    showScanner = false
                    export(room, frames: frames)
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

    private func export(_ room: CapturedRoom, frames: [Data]) {
        errorMessage = nil
        isUploading = true
        uploadStage = "Uploading room..."

        Task {
            do {
                let (layout, debugSummary) = RoomExporter.buildLayout(from: room)
                await MainActor.run { diagnostics = debugSummary }
                let session = UUID().uuidString
                try await LayoutUploader.upload(layout, session: session)

                // Colors are a bonus on top of a room that already works —
                // if the frames or the colorize call fail, the layout is
                // still uploaded and shareable, so don't fail the scan over
                // it. Just note it in the diagnostics.
                var colorNote = "colors: skipped (no frames captured)"
                if !frames.isEmpty {
                    await MainActor.run { uploadStage = "Sending \(frames.count) colour photos..." }
                    do {
                        // In parallel — these are independent uploads, and
                        // run sequentially they cost six round trips back
                        // to back before colorizing can even start.
                        try await withThrowingTaskGroup(of: Void.self) { group in
                            for frame in frames {
                                group.addTask {
                                    try await LayoutUploader.uploadPhoto(frame, session: session)
                                }
                            }
                            try await group.waitForAll()
                        }
                        await MainActor.run { uploadStage = "Reading room colours..." }
                        try await LayoutUploader.colorize(session: session)
                        colorNote = "colors: applied from \(frames.count) frames"
                    } catch {
                        colorNote = "colors: failed — \(error.localizedDescription)"
                    }
                }
                await MainActor.run { diagnostics = debugSummary + "\n" + colorNote }

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
