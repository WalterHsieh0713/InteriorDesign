import SwiftUI
import RoomPlan
import simd

/// Flattens a 4x4 into the 16-element **column-major** array three.js'
/// `Matrix4.fromArray` expects. `simd_float4x4.columns` is already stored
/// column-major, so this is just a concatenation — but write it out
/// explicitly rather than relying on memory layout, because getting it
/// transposed produces a projection that's correct at the identity and
/// wrong everywhere else, which is the hardest version of this bug to spot.
private func columnMajor(_ m: simd_float4x4) -> [Float] {
    [
        m.columns.0.x, m.columns.0.y, m.columns.0.z, m.columns.0.w,
        m.columns.1.x, m.columns.1.y, m.columns.1.z, m.columns.1.w,
        m.columns.2.x, m.columns.2.y, m.columns.2.z, m.columns.2.w,
        m.columns.3.x, m.columns.3.y, m.columns.3.z, m.columns.3.w,
    ]
}

struct ContentView: View {
    @EnvironmentObject private var deepLink: DeepLinkSession
    @State private var showScanner = false
    @State private var showShareSheet = false
    @State private var shareURL: URL?
    @State private var errorMessage: String?
    @State private var isUploading = false
    @State private var uploadStage = "Uploading..."
    @State private var diagnostics: String?
    @State private var handoffComplete = false

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

            if handoffComplete {
                Label("Sent to your computer — check the browser", systemImage: "checkmark.circle.fill")
                    .foregroundStyle(.green)
                    .font(.subheadline)
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
        .onChange(of: deepLink.pendingSessionId) { _, newValue in
            if newValue != nil && !showScanner && !isUploading {
                handoffComplete = false
                showScanner = true
            }
        }
    }

    private func export(_ room: CapturedRoom, frames: [CapturedFrame]) {
        errorMessage = nil
        isUploading = true
        uploadStage = "Uploading room..."
        // Capture before any `await` — deepLink.pendingSessionId could change
        // while the upload is in flight if a second QR is scanned.
        let linkedSession = deepLink.pendingSessionId

        Task {
            do {
                var (layout, debugSummary) = RoomExporter.buildLayout(from: room)
                await MainActor.run { diagnostics = debugSummary }
                let session = linkedSession ?? UUID().uuidString

                // Photos go up *first*, because each one's public URL has to
                // be embedded in the layout's cameraFrames before the layout
                // itself is uploaded. Uploading the layout first would mean a
                // second PUT just to add them.
                var colorNote = "photos: skipped (none captured)"
                if !frames.isEmpty {
                    await MainActor.run { uploadStage = "Sending \(frames.count) photos..." }
                    do {
                        // The ARKit world -> room space change of frame. Every
                        // camera pose has to go through this or the projected
                        // photos land nowhere near the geometry they belong to.
                        let alignment = RoomExporter.alignmentMatrix(for: room)

                        // Concurrent, but bounded. The frame cap is gone, so
                        // this can now be every frame sampled during the scan
                        // — firing a few hundred simultaneous uploads gets
                        // them throttled or timed out rather than finishing
                        // any sooner. Each task carries its index back,
                        // because a task group's completion order is not its
                        // submission order and every URL has to rejoin the
                        // pose it was captured with.
                        let maxInFlight = 6
                        var urls = [Int: String]()
                        try await withThrowingTaskGroup(of: (Int, String).self) { group in
                            var next = 0
                            for _ in 0..<min(maxInFlight, frames.count) {
                                let index = next
                                group.addTask {
                                    (index, try await LayoutUploader.uploadPhoto(frames[index].jpeg, session: session))
                                }
                                next += 1
                            }
                            while let (index, url) = try await group.next() {
                                urls[index] = url
                                if next < frames.count {
                                    let index = next
                                    group.addTask {
                                        (index, try await LayoutUploader.uploadPhoto(frames[index].jpeg, session: session))
                                    }
                                    next += 1
                                }
                            }
                        }

                        layout.cameraFrames = frames.enumerated().compactMap { index, frame in
                            guard let url = urls[index] else { return nil }
                            let roomSpace = alignment * frame.transform
                            return CameraFrameJSON(
                                url: url,
                                transform: columnMajor(roomSpace),
                                fovY: frame.fovY,
                                width: frame.pixelWidth,
                                height: frame.pixelHeight
                            )
                        }
                        colorNote = "photos: \(layout.cameraFrames?.count ?? 0) uploaded with poses"
                    } catch {
                        // A room without projected photos still renders fine
                        // on flat colours — don't fail the whole scan for it.
                        colorNote = "photos: failed — \(error.localizedDescription)"
                    }
                }

                try await LayoutUploader.upload(layout, session: session)

                if !frames.isEmpty {
                    await MainActor.run { uploadStage = "Reading room colours..." }
                    do {
                        try await LayoutUploader.colorize(session: session)
                        colorNote += "\ncolors: applied"

                        // Last, because it needs the cameraFrames that went up
                        // with the layout, and because it's the most optional
                        // step here — a room missing its thermostat is still a
                        // perfectly good room.
                        await MainActor.run { uploadStage = "Looking for small items..." }
                        do {
                            let summary = try await LayoutUploader.detectDetails(session: session)
                            colorNote += "\n" + summary
                        } catch {
                            colorNote += "\ndetails: failed — \(error.localizedDescription)"
                        }
                    } catch {
                        colorNote += "\ncolors: failed — \(error.localizedDescription)"
                    }
                }
                await MainActor.run { diagnostics = debugSummary + "\n" + colorNote }

                if linkedSession != nil {
                    // The browser that showed the QR is already polling for
                    // this session — it'll navigate itself the moment the
                    // layout lands. Nothing to hand back manually.
                    await MainActor.run {
                        isUploading = false
                        deepLink.pendingSessionId = nil
                        handoffComplete = true
                    }
                } else {
                    let url = LayoutUploader.shareableRoomURL(session: session)
                    await MainActor.run {
                        isUploading = false
                        shareURL = url
                    }
                    // Give the fullScreenCover a moment to finish dismissing
                    // before presenting the share sheet, otherwise SwiftUI
                    // can drop it.
                    try? await Task.sleep(nanoseconds: 300_000_000)
                    await MainActor.run {
                        showShareSheet = true
                    }
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
