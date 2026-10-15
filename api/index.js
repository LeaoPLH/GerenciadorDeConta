import { neon } from '@neondatabase/serverless';
import { createApp } from '../lib/app.js';

const handle = createApp(neon(process.env.DATABASE_URL), process.env.JWT_SECRET);

export default async function (req, res) {
  const { status, body } = await handle(req.method, req.url, req.body, req.headers.authorization);
  res.status(status).json(body);
}
