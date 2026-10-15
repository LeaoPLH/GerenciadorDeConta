import SwiftUI

@main struct ContasApp: App {
    @State private var loggedIn = Keychain.token() != nil
    var body: some Scene {
        WindowGroup {
            if loggedIn { AccountsView(onLogout: { Keychain.save(nil); loggedIn = false }) }
            else { LoginView(onDone: { loggedIn = true }) }
        }
    }
}

struct LoginView: View {
    var onDone: () -> Void
    @State private var email = "", password = "", error = ""
    var body: some View {
        Form {
            TextField("E-mail", text: $email).textInputAutocapitalization(.never).keyboardType(.emailAddress)
            SecureField("Senha (mín. 8)", text: $password)
            Button("Entrar") { go(register: false) }
            Button("Criar conta") { go(register: true) }
            if !error.isEmpty { Text(error).foregroundStyle(.red) }
        }
    }
    func go(register: Bool) {
        Task {
            do { try await API.login(email, password, register: register); onDone() }
            catch { self.error = (error as? APIError)?.error ?? "falha" }
        }
    }
}

struct AccountsView: View {
    var onLogout: () -> Void
    @State private var accounts: [Account] = []
    @State private var adding = false

    var body: some View {
        NavigationStack {
            List {
                ForEach(accounts) { a in
                    HStack {
                        VStack(alignment: .leading) { Text(a.description); Text(a.due_date).font(.caption) }
                        Spacer()
                        Text("R$ \(a.amount)")
                        Button { toggle(a) } label: { Image(systemName: a.paid ? "checkmark.circle.fill" : "circle") }
                            .buttonStyle(.plain)
                    }
                }
                .onDelete { idx in
                    let ids = idx.compactMap { accounts[$0].id }
                    Task { for id in ids { let _: [String: String]? = try? await API.call("DELETE", "/accounts/\(id)") }; await load() }
                }
            }
            .navigationTitle("Contas")
            .toolbar {
                Button("Sair", action: onLogout)
                Button { adding = true } label: { Image(systemName: "plus") }
            }
            .sheet(isPresented: $adding) { AddAccountView { adding = false; Task { await load() } } }
            .task { await load() }
            .refreshable { await load() }
        }
    }

    func load() async {
        guard let list: [Account] = try? await API.call("GET", "/accounts") else { return }
        accounts = list
        await Reminders.reschedule(list)
    }
    func toggle(_ a: Account) {
        var b = a; b.paid.toggle()
        Task { let _: Account? = try? await API.call("PUT", "/accounts/\(a.id!)", body: b); await load() }
    }
}

struct AddAccountView: View {
    var onDone: () -> Void
    @State private var desc = "", amount = "", due = Date.now, recurrence = "none"
    var body: some View {
        NavigationStack {
            Form {
                TextField("Descrição", text: $desc)
                TextField("Valor", text: $amount).keyboardType(.decimalPad)
                DatePicker("Vencimento", selection: $due, displayedComponents: .date)
                Picker("Recorrência", selection: $recurrence) {
                    ForEach(["none", "weekly", "monthly", "yearly"], id: \.self) { Text($0) }
                }
            }
            .toolbar { Button("Salvar", action: save) }
        }
    }
    func save() {
        let f = DateFormatter(); f.dateFormat = "yyyy-MM-dd"
        let a = Account(description: desc, amount: amount.replacingOccurrences(of: ",", with: "."),
                        due_date: f.string(from: due), recurrence: recurrence)
        Task { let _: Account? = try? await API.call("POST", "/accounts", body: a); onDone() }
    }
}
