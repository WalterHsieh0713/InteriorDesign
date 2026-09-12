import SwiftUI
import RoomPlan

/// Full-screen live scan UI: Apple's RoomCaptureView (camera feed + built-in
/// coaching overlay) with a Cancel/Done bar on top.
struct RoomScanView: View {
    @StateObject private var model = RoomCaptureModel()
    let onFinish: (CapturedRoom) -> Void
    let onCancel: () -> Void

    var body: some View {
        ZStack(alignment: .bottom) {
            RoomCaptureRepresentable(captureView: model.captureView)
                .ignoresSafeArea()

            HStack {
                Button("Cancel", role: .cancel) {
                    model.stopSession()
                    onCancel()
                }
                .buttonStyle(.bordered)

                Spacer()

                Button("Done") {
                    model.stopSession()
                }
                .buttonStyle(.borderedProminent)
            }
            .padding()
            .background(.ultraThinMaterial)
        }
        .onAppear { model.startSession() }
        .onReceive(model.$finishedRoom.compactMap { $0 }) { room in
            onFinish(room)
        }
        .alert("Scan Error", isPresented: Binding(
            get: { model.captureError != nil },
            set: { if !$0 { model.captureError = nil } }
        )) {
            Button("OK") { model.captureError = nil }
        } message: {
            Text(model.captureError ?? "")
        }
    }
}

private struct RoomCaptureRepresentable: UIViewRepresentable {
    let captureView: RoomCaptureView

    func makeUIView(context: Context) -> RoomCaptureView {
        captureView
    }

    func updateUIView(_ uiView: RoomCaptureView, context: Context) {}
}
