import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../lib/app.js';

// tiny fake DB: only what auth + guard + validation paths touch
const users = [];
const sql = { async query(t, p) {
  if (t.startsWith('insert into users')) { users.push({ id: users.length + 1, email: p[0], password_hash: p[1] }); return [users.at(-1)]; }
  if (t.startsWith('select id, password_hash')) return users.filter(u => u.email === p[0]);
  return [];
} };
const app = createApp(sql, 'secret');

test('register, login, auth guard, validation', async () => {
  assert.equal((await app('GET', '/api/accounts')).status, 401);
  assert.equal((await app('POST', '/api/auth/register', { email: 'a@b.c', password: 'short' })).status, 400);
  assert.equal((await app('POST', '/api/auth/register', { email: 'a@b.c', password: 'password1' })).status, 200);
  assert.equal((await app('POST', '/api/auth/login', { email: 'a@b.c', password: 'wrongpass1' })).status, 401);
  const l = await app('POST', '/api/auth/login', { email: 'a@b.c', password: 'password1' });
  const h = 'Bearer ' + l.body.token;
  assert.equal((await app('GET', '/api/accounts', null, h)).status, 200);
  assert.equal((await app('POST', '/api/accounts', { description: 'x', amount: 1, due_date: 'bad' }, h)).status, 400);
  assert.equal((await app('PUT', '/api/accounts', {}, h)).status, 405);
});
