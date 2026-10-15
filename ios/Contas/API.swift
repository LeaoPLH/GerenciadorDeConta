import Foundation
import Security

struct Account: Codable, Identifiable {
    var id: Int?
    var description: String
    var amount: String          // numeric comes back as string from Postgres
    var due_date: String        // YYYY-MM-DD
    var recurrence = "none"
    var paid = false
    var category_id: Int?
    var tag_ids: [Int]?
}
struct Named: Codable, Identifiable { var id: Int?; var name: String }
struct APIError: Error, Decodable { var error: String }

enum Keychain {
    static func token() -> String? {
        let q: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrAccount as String: "jwt",
                                kSecReturnData as String: true]
        var out: AnyObject?
        guard SecItemCopyMatching(q as CFDictionary, &out) == errSecSuccess, let d = out as? Data else { return nil }
        return String(data: d, encoding: .utf8)
    }
    static func save(_ t: String?) {
        let q: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrAccount as String: "jwt"]
        SecItemDelete(q as CFDictionary)
        if let t { SecItemAdd(q.merging([kSecValueData as String: Data(t.utf8)]) { $1 } as CFDictionary, nil) }
    }
}

enum API {
    static let base = URL(string: "https://gerenciadordeconta.vercel.app/api")!

    static func call<T: Decodable>(_ method: String, _ path: String, body: Encodable? = nil) async throws -> T {
        var r = URLRequest(url: URL(string: base.absoluteString + path)!)
        r.httpMethod = method
        if let body { r.httpBody = try JSONEncoder().encode(body); r.setValue("application/json", forHTTPHeaderField: "Content-Type") }
        if let t = Keychain.token() { r.setValue("Bearer \(t)", forHTTPHeaderField: "Authorization") }
        let (data, resp) = try await URLSession.shared.data(for: r)
        if (resp as? HTTPURLResponse)?.statusCode ?? 500 >= 400 {
            throw (try? JSONDecoder().decode(APIError.self, from: data)) ?? APIError(error: "erro de rede")
        }
        return try JSONDecoder().decode(T.self, from: data)
    }

    static func login(_ email: String, _ password: String, register: Bool) async throws {
        struct Creds: Encodable { var email, password: String }
        struct Tok: Decodable { var token: String }
        let t: Tok = try await call("POST", register ? "/auth/register" : "/auth/login", body: Creds(email: email, password: password))
        Keychain.save(t.token)
    }
}

// Notificações locais: um aviso às 9h, 1 dia antes do vencimento. Chame após cada fetch.
import UserNotifications
enum Reminders {
    static func reschedule(_ accounts: [Account]) async {
        let c = UNUserNotificationCenter.current()
        _ = try? await c.requestAuthorization(options: [.alert, .sound])
        c.removeAllPendingNotificationRequests()
        let f = DateFormatter(); f.dateFormat = "yyyy-MM-dd"
        for a in accounts where !a.paid {
            guard let id = a.id, let due = f.date(from: a.due_date),
                  let day = Calendar.current.date(byAdding: .day, value: -1, to: due), day > .now else { continue }
            var comps = Calendar.current.dateComponents([.year, .month, .day], from: day); comps.hour = 9
            let content = UNMutableNotificationContent()
            content.title = "Conta vence amanhã"; content.body = "\(a.description) — R$ \(a.amount)"
            try? await c.add(UNNotificationRequest(identifier: "acc-\(id)", content: content,
                trigger: UNCalendarNotificationTrigger(dateMatching: comps, repeats: false)))
        }
    }
}
