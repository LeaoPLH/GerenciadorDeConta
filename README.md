# Gerenciador de Contas

- `db/schema.sql` — rodar no Neon (SQL editor).
- `api/index.js` + `lib/app.js` — API REST serverless (Vercel). Env: `DATABASE_URL`, `JWT_SECRET`.
- `scriptable/contas.js` — app no iPhone via [Scriptable](https://apps.apple.com) (App Store, gratuito).
  Copie o conteúdo para um script novo no Scriptable. Na primeira execução, ele pede e-mail e senha.
  Para avisos diários, crie um automatismo no app Atalhos que executa o script todo dia.
- `npm test` — testes da API (sem banco, com fake).

Endpoints: `POST /api/auth/{register,login}`; `GET|POST /api/accounts[?from=&to=]`, `PUT|DELETE /api/accounts/:id`
(aceita `tag_ids`, `category_id`, `paid`); `GET|POST /api/{categories,tags}`, `PUT|DELETE /api/{categories,tags}/:id`.
