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

    // TODO: set this to your deployed Vercel URL before building — check
    // the Vercel dashboard for the exact URL. Must be https, no trailing
    // slash.
    static let baseURL = URL(string: "https://YOUR-DEPLOYED-URL.vercel.app")!

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

    static func shareableRoomURL(session: String) -> URL {
        var components = URLComponents(url: baseURL.appendingPathComponent("room"), resolvingAgainstBaseURL: false)!
        components.queryItems = [URLQueryItem(name: "session", value: session)]
        return components.url!
    }
}
