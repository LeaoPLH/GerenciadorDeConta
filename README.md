# Gerenciador de Contas

- `db/schema.sql` — rodar no Neon (SQL editor).
- `api/index.js` + `lib/app.js` — API REST serverless (Vercel). Env: `DATABASE_URL`, `JWT_SECRET`.
- `ios/Contas/*.swift` — fontes SwiftUI. Crie um projeto iOS 17 "Contas" no Xcode, arraste os arquivos,
  ajuste `API.base` e habilite Notificações.
- `npm test` — testes da API (sem banco, com fake).

Endpoints: `POST /api/auth/{register,login}`; `GET|POST /api/accounts[?from=&to=]`, `PUT|DELETE /api/accounts/:id`
(aceita `tag_ids`, `category_id`, `paid`); `GET|POST /api/{categories,tags}`, `PUT|DELETE /api/{categories,tags}/:id`.
