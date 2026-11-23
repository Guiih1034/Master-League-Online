const path = require('node:path');
const express = require('express');
const { init, one, all } = require('./db');
const auth = require('./auth');
const { router, closeAuction } = require('./routes');

const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(express.json({ limit: '256kb' }));
app.use((req, res, next) => {
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('X-Frame-Options', 'SAMEORIGIN');
  res.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

app.get('/api/health', (req, res) => res.json({ ok: true, ts: Date.now() }));
app.post('/api/auth/register', (req,res,next)=>Promise.resolve(auth.register(req,res,next)).catch(next));
app.post('/api/auth/login', (req,res,next)=>Promise.resolve(auth.login(req,res,next)).catch(next));
app.post('/api/auth/logout', (req,res,next)=>Promise.resolve(auth.logout(req,res,next)).catch(next));
app.post('/api/auth/resend-verify', (req,res,next)=>Promise.resolve(auth.resendVerify(req,res,next)).catch(next));
app.get('/api/auth/verify', (req,res,next)=>Promise.resolve(auth.verifyEmail(req,res,next)).catch(next));
app.get('/api/me', auth.auth, (req,res,next)=>Promise.resolve(auth.me(req,res,next)).catch(next));

const clients = new Map();
global.broadcast = async (memberId, payload) => {
  try {
    const m = await one('SELECT user_id FROM members WHERE id=?', memberId);
    if (!m || !m.user_id) return;
    const set = clients.get(m.user_id);
    if (!set) return;
    const data = 'data: ' + JSON.stringify(payload) + '\n\n';
    for (const res of set) res.write(data);
  } catch {}
};

app.get('/api/events', auth.auth, (req, res) => {
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  res.flushHeaders();
  res.write('data: {"type":"hello"}\n\n');
  const id = req.user.id;
  if (!clients.has(id)) clients.set(id, new Set());
  clients.get(id).add(res);
  const ping = setInterval(() => res.write(': ping\n\n'), 25000);
  req.on('close', () => {
    clearInterval(ping);
    clients.get(id)?.delete(res);
    if (!clients.get(id)?.size) clients.delete(id);
  });
});

let ready = init();
app.use(async (req, res, next) => { try { await ready; next(); } catch (e) { next(e); } });

app.use('/api', router);
app.use('/api', (req, res) => res.status(404).json({ error: 'Rota não encontrada' }));

const publicDir = path.join(__dirname, '..', 'public');
app.use(express.static(publicDir, { maxAge: process.env.NODE_ENV === 'production' ? '1h' : 0, index: false }));
app.use((req, res) => res.sendFile(path.join(publicDir, 'index.html')));

app.use((err, req, res, next) => {
  console.error(err);
  if (res.headersSent) return next(err);
  res.status(500).json({ error: err.message || 'Erro interno' });
});

if (!process.env.VERCEL) {
  setInterval(async () => {
    try {
      await ready;
      const due = await all('SELECT * FROM auctions WHERE status="aberta" AND ends_at<=?', Date.now());
      for (const a of due) await closeAuction(a);
    } catch (e) { console.error('auction tick:', e.message); }
  }, 20000).unref();
}

const PORT = Number(process.env.PORT || 3000);
if (require.main === module) {
  ready.then(() => app.listen(PORT, '0.0.0.0', () => console.log(`Master League Online rodando em http://localhost:${PORT}`)))
    .catch(e => { console.error(e); process.exit(1); });
}

module.exports = app;
