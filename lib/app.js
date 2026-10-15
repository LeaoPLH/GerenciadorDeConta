import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const RECURRENCE = ['none', 'weekly', 'monthly', 'yearly'];
const err = (status, error) => ({ status, body: { error } });
const ok = (body, status = 200) => ({ status, body });

// sql: { query(text, params) -> rows[] }. Returns handle(method, url, body, authHeader).
export function createApp(sql, secret) {
  const q = (text, params) => sql.query(text, params);

  // due_date as YYYY-MM-DD text: the driver would otherwise send a JS Date timestamp
  const ACCOUNT = `select a.id, a.user_id, a.category_id, a.description, a.amount, a.recurrence, a.paid,
    to_char(a.due_date, 'YYYY-MM-DD') as due_date, a.created_at, a.updated_at, coalesce(array_agg(t.tag_id) filter (where t.tag_id is not null), '{}') as tag_ids
    from accounts a left join account_tags t on t.account_id = a.id`;

  async function setTags(uid, accountId, tagIds) {
    await q('delete from account_tags where account_id=$1', [accountId]);
    if (tagIds.length)
      await q('insert into account_tags select $1, id from tags where user_id=$2 and id = any($3::int[])',
        [accountId, uid, tagIds]);
  }

  async function auth(path, body) {
    const { email, password } = body ?? {};
    if (!/^\S+@\S+$/.test(email ?? '') || (password ?? '').length < 8)
      return err(400, 'email inválido ou senha com menos de 8 caracteres');
    let user;
    if (path === '/auth/register') {
      try {
        [user] = await q('insert into users(email,password_hash) values($1,$2) returning id',
          [email.toLowerCase(), await bcrypt.hash(password, 10)]);
      } catch { return err(409, 'e-mail já cadastrado'); }
    } else {
      const [row] = await q('select id, password_hash from users where email=$1', [email.toLowerCase()]);
      if (!row || !(await bcrypt.compare(password, row.password_hash))) return err(401, 'credenciais inválidas');
      user = row;
    }
    return ok({ token: jwt.sign({ sub: user.id }, secret, { expiresIn: '30d' }) });
  }

  // categories and tags share one shape
  async function named(table, method, id, body, uid) {
    const name = body?.name?.trim();
    if (method === 'GET') return ok(await q(`select * from ${table} where user_id=$1 order by name`, [uid]));
    if (method === 'POST' || method === 'PUT') {
      if (!name) return err(400, 'name obrigatório');
      const [r] = method === 'POST'
        ? await q(`insert into ${table}(user_id,name) values($1,$2) returning *`, [uid, name])
        : await q(`update ${table} set name=$3, updated_at=now() where id=$1 and user_id=$2 returning *`, [id, uid, name]);
      return r ? ok(r, method === 'POST' ? 201 : 200) : err(404, 'não encontrado');
    }
    if (method === 'DELETE') {
      const r = await q(`delete from ${table} where id=$1 and user_id=$2 returning id`, [id, uid]);
      return r.length ? ok({}) : err(404, 'não encontrado');
    }
    return err(405, 'método não permitido');
  }

  async function accounts(method, id, body, uid, query) {
    if (method === 'GET')
      return ok(await q(`${ACCOUNT} where a.user_id=$1 and ($2::date is null or a.due_date >= $2)
        and ($3::date is null or a.due_date <= $3) group by a.id order by a.due_date`,
        [uid, query.get('from'), query.get('to')]));
    if (method === 'DELETE') {
      const r = await q('delete from accounts where id=$1 and user_id=$2 returning id', [id, uid]);
      return r.length ? ok({}) : err(404, 'não encontrado');
    }
    if (method !== 'POST' && method !== 'PUT') return err(405, 'método não permitido');
    const { description, amount, due_date, recurrence = 'none', category_id = null, paid = false, tag_ids } = body ?? {};
    if (!description || !(Number(amount) >= 0) || !/^\d{4}-\d{2}-\d{2}$/.test(due_date ?? '') || !RECURRENCE.includes(recurrence))
      return err(400, 'description, amount, due_date (YYYY-MM-DD) ou recurrence inválidos');
    const vals = [uid, description, amount, due_date, recurrence, category_id, paid];
    const [a] = method === 'POST'
      ? await q(`insert into accounts(user_id,description,amount,due_date,recurrence,category_id,paid)
          values($1,$2,$3,$4,$5,$6,$7) returning id`, vals)
      : await q(`update accounts set description=$2,amount=$3,due_date=$4,recurrence=$5,category_id=$6,paid=$7,updated_at=now()
          where id=$8 and user_id=$1 returning id`, [...vals, id]);
    if (!a) return err(404, 'não encontrado');
    if (Array.isArray(tag_ids)) await setTags(uid, a.id, tag_ids);
    const [full] = await q(`${ACCOUNT} where a.id=$1 group by a.id`, [a.id]);
    return ok(full, method === 'POST' ? 201 : 200);
  }

  return async function handle(method, url, body, authHeader) {
    try {
      const { pathname, searchParams } = new URL(url, 'http://x');
      const path = pathname.replace(/^\/api/, '');
      if (method === 'POST' && (path === '/auth/login' || path === '/auth/register')) return await auth(path, body);

      let uid;
      try { uid = jwt.verify((authHeader ?? '').replace(/^Bearer /, ''), secret).sub; }
      catch { return err(401, 'não autenticado'); }

      const m = path.match(/^\/(accounts|categories|tags)(?:\/(\d+))?$/);
      if (!m) return err(404, 'rota inexistente');
      const [, res, id] = m;
      if (id === undefined && (method === 'PUT' || method === 'DELETE')) return err(405, 'id obrigatório');
      return res === 'accounts' ? await accounts(method, id, body, uid, searchParams)
        : await named(res, method, id, body, uid);
    } catch (e) {
      console.error(e);
      return err(500, 'erro interno');
    }
  };
}
