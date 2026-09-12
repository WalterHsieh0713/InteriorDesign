import Foundation

enum LayoutUploaderError: LocalizedError {
    case serverError(status: Int, message: String)

    var errorDescription: String? {
        switch self {
        case .serverError(let status, let message):
            return "Server returned \(status): \(message)"
        }
    }
}

enum LayoutUploader {

    /// The *production* alias, which always serves the latest deploy.
    ///
    /// Do not replace this with a URL copied from a specific deployment in
    /// the Vercel dashboard — those look like
    /// `room-scanner-4bc23qbk8-1v3.vercel.app`, with a per-build hash, and
    /// are pinned forever to the commit that produced them. Pointing the
    /// app at one of those means every scan you take opens against a
    /// frozen old copy of the web app, and shipped web fixes silently
    /// never reach you. That already happened once.
    static let baseURL = URL(string: "https://room-scanner-pcidbk648-1v3.vercel.app")!

    /// PUTs straight to the same /api/layout endpoint the web editor uses
    /// to persist drag edits — it already validates against the real zod
    /// schema server-side, so a malformed conversion comes back as a clear
    /// 400 with the specific field that's wrong.
    static func upload(_ layout: RoomLayoutJSON, session: String) async throws {
        let url = baseURL.appendingPathComponent("api/layout")
        var request = URLRequest(url: url)
        request.httpMethod = "PUT"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(LayoutUploadRequest(session: session, layout: layout))

        let (data, response) = try await URLSession.shared.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse else {
            throw LayoutUploaderError.serverError(status: -1, message: "No HTTP response")
        }
        guard (200...299).contains(httpResponse.statusCode) else {
            let message = String(data: data, encoding: .utf8) ?? "Unknown error"
            throw LayoutUploaderError.serverError(status: httpResponse.statusCode, message: message)
        }
    }

    /// Posts one sampled camera frame to the same endpoint the web capture
    /// flow uses, keyed by session, so /api/colorize has imagery to read
    /// real colors from.
    /// Returns the uploaded photo's public URL, which is what a
    /// `CameraFrameJSON` has to point at — the server names the stored file
    /// with its own UUID, so this response is the only way to know which URL
    /// belongs to which frame's pose.
    @discardableResult
    static func uploadPhoto(_ jpeg: Data, session: String) async throws -> String {
        let boundary = "Boundary-\(UUID().uuidString)"
        var request = URLRequest(url: baseURL.appendingPathComponent("api/upload"))
        request.httpMethod = "POST"
        request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")

        var body = Data()
        func append(_ string: String) {
            body.append(Data(string.utf8))
        }
        append("--\(boundary)\r\n")
        append("Content-Disposition: form-data; name=\"session\"\r\n\r\n")
        append("\(session)\r\n")
        append("--\(boundary)\r\n")
        append("Content-Disposition: form-data; name=\"file\"; filename=\"frame.jpg\"\r\n")
        append("Content-Type: image/jpeg\r\n\r\n")
        body.append(jpeg)
        append("\r\n--\(boundary)--\r\n")
        request.httpBody = body

        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse, (200...299).contains(http.statusCode) else {
            let status = (response as? HTTPURLResponse)?.statusCode ?? -1
            throw LayoutUploaderError.serverError(
                status: status,
                message: String(data: data, encoding: .utf8) ?? "Photo upload failed"
            )
        }

        struct UploadResponse: Decodable {
            let url: String?
        }
        guard let url = (try? JSONDecoder().decode(UploadResponse.self, from: data))?.url, !url.isEmpty else {
            throw LayoutUploaderError.serverError(
                status: http.statusCode,
                message: "Upload succeeded but returned no public URL — is the web app new enough to send one?"
            )
        }
        return url
    }

    /// Asks the server to read real colors off the uploaded frames and merge
    /// them into the already-stored layout. Geometry is left untouched.
    static func colorize(session: String) async throws {
        var request = URLRequest(url: baseURL.appendingPathComponent("api/colorize"))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(["session": session])

        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse, (200...299).contains(http.statusCode) else {
            let status = (response as? HTTPURLResponse)?.statusCode ?? -1
            throw LayoutUploaderError.serverError(
                status: status,
                message: String(data: data, encoding: .utf8) ?? "Colorize failed"
            )
        }
    }

    /// Asks the server to find the small items LiDAR can't see — thermostats,
    /// outlets, smoke alarms, monitors, artwork — by looking at the uploaded
    /// photos and back-projecting each 2D detection onto the scanned geometry
    /// using that photo's camera pose. Requires cameraFrames to have been
    /// uploaded with the layout, which is why this runs last.
    ///
    /// Returns a line for the on-screen diagnostics. Scanning means walking
    /// away from the Mac, so this panel is the only place these numbers can
    /// actually be read.
    @discardableResult
    static func detectDetails(session: String) async throws -> String {
        var request = URLRequest(url: baseURL.appendingPathComponent("api/detect-details"))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(["session": session])

        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse, (200...299).contains(http.statusCode) else {
            let status = (response as? HTTPURLResponse)?.statusCode ?? -1
            throw LayoutUploaderError.serverError(
                status: status,
                message: String(data: data, encoding: .utf8) ?? "Detail detection failed"
            )
        }

        struct DetectResponse: Decodable {
            let added: Int?
            let analyzed: Int?
            let failed: Int?
            let detected: Int?
            let placed: Int?
            let note: String?
        }

        guard let result = try? JSONDecoder().decode(DetectResponse.self, from: data) else {
            return "details: unreadable response"
        }

        let added = result.added ?? 0
        if added > 0 {
            return "details: \(added) added from \(result.detected ?? 0) detections over \(result.analyzed ?? 0) frames"
        }

        // "0 added" has several very different causes — every request
        // rate-limited, the model genuinely seeing nothing, nothing placeable
        // against the geometry, or everything discarded for being seen only
        // once. Only the per-stage counts tell them apart.
        var lines = ["details: 0 added"]
        lines.append("  frames \(result.analyzed ?? 0), failed \(result.failed ?? 0)")
        lines.append("  detections \(result.detected ?? 0), placed \(result.placed ?? 0)")
        if let note = result.note { lines.append("  \(note)") }
        return lines.joined(separator: "\n")
    }

    static func shareableRoomURL(session: String) -> URL {
        var components = URLComponents(url: baseURL.appendingPathComponent("room"), resolvingAgainstBaseURL: false)!
        components.queryItems = [URLQueryItem(name: "session", value: session)]
        return components.url!
    }
}
