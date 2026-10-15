// Gerenciador de Contas — script para o app Scriptable (App Store).
// Mostra as contas numa WebView e agenda avisos locais 1 dia antes do vencimento, às 9h.
// Rode manualmente no app ou por um automatismo diário no Atalhos.

const API = "https://gestaodecontas-ricardo.vercel.app/api";
const KEY_EMAIL = "contas.email";
const KEY_PASSWORD = "contas.password";

async function api(path, { method = "GET", body, token } = {}) {
  const req = new Request(API + path);
  req.method = method;
  req.headers = { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) };
  if (body) req.body = JSON.stringify(body);
  const data = await req.loadJSON();
  if (req.response.statusCode >= 400) throw new Error(data.error || `HTTP ${req.response.statusCode}`);
  return data;
}

// Pede e guarda e-mail/senha no Keychain do iPhone, na primeira vez.
async function credentials() {
  if (Keychain.contains(KEY_EMAIL) && Keychain.contains(KEY_PASSWORD)) {
    return { email: Keychain.get(KEY_EMAIL), password: Keychain.get(KEY_PASSWORD) };
  }
  const a = new Alert();
  a.title = "Entrar";
  a.addTextField("E-mail", "");
  a.addSecureTextField("Senha", "");
  a.addAction("Entrar");
  a.addCancelAction("Cancelar");
  if ((await a.presentAlert()) === -1) return null;
  const email = a.textFieldValue(0).trim();
  const password = a.textFieldValue(1);
  Keychain.set(KEY_EMAIL, email);
  Keychain.set(KEY_PASSWORD, password);
  return { email, password };
}

async function login() {
  const creds = await credentials();
  if (!creds) return null;
  try {
    const { token } = await api("/auth/login", { method: "POST", body: creds });
    return token;
  } catch (e) {
    // senha errada ou guardada errada: apaga para pedir de novo na próxima vez
    Keychain.remove(KEY_EMAIL);
    Keychain.remove(KEY_PASSWORD);
    throw e;
  }
}

// Vencimento "YYYY-MM-DD" → aviso às 9h do dia anterior, se ainda estiver no futuro.
async function scheduleReminders(accounts) {
  Notification.removeAllPending();
  for (const a of accounts) {
    if (a.paid) continue;
    const [y, m, d] = a.due_date.split("-").map(Number);
    const when = new Date(y, m - 1, d - 1, 9, 0);
    if (when <= new Date()) continue;
    const n = new Notification();
    n.identifier = `conta-${a.id}`;
    n.title = "Conta vence amanhã";
    n.body = `${a.description} — R$ ${a.amount}`;
    n.setTriggerDate(when);
    await n.schedule();
  }
}

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function page(accounts) {
  const total = accounts.filter((a) => !a.paid).reduce((s, a) => s + Number(a.amount), 0);
  const rows = accounts.map((a) => `
    <li class="${a.paid ? "paid" : ""}">
      <div><b>${esc(a.description)}</b><small>vence ${esc(a.due_date.split("-").reverse().join("/"))}</small></div>
      <span>R$ ${Number(a.amount).toFixed(2).replace(".", ",")}</span>
    </li>`).join("");
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  body { font-family: -apple-system, system-ui; margin: 0; padding: 16px; background: #f2f2f7; color: #111; }
  h1 { font-size: 22px; margin: 0 0 4px; }
  .total { color: #666; margin-bottom: 16px; }
  ul { list-style: none; padding: 0; margin: 0; background: #fff; border-radius: 12px; }
  li { display: flex; justify-content: space-between; align-items: center; padding: 12px 14px; border-bottom: 1px solid #eee; }
  li:last-child { border-bottom: none; }
  li div { display: flex; flex-direction: column; }
  small { color: #888; }
  .paid { opacity: .45; text-decoration: line-through; }
  @media (prefers-color-scheme: dark) {
    body { background: #000; color: #eee; } ul { background: #1c1c1e; } li { border-color: #333; } small, .total { color: #999; }
  }
</style></head><body>
<h1>Contas a pagar</h1>
<div class="total">A pagar: R$ ${total.toFixed(2).replace(".", ",")}</div>
<ul>${rows || "<li>Nenhuma conta.</li>"}</ul>
</body></html>`;
}

async function main() {
  let token = await login();
  if (!token) return;
  let accounts;
  try {
    accounts = await api("/accounts", { token });
  } catch (e) {
    // token expirado (30 dias) ou credenciais inválidas: tenta de novo com login
    token = await login();
    if (!token) return;
    accounts = await api("/accounts", { token });
  }
  await scheduleReminders(accounts);
  if (config.runsInWidget) return;
  const wv = new WebView();
  await wv.loadHTML(page(accounts));
  await wv.present(true);
}

await main();
Script.complete();
