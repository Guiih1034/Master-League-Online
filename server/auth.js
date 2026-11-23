const crypto = require('node:crypto');
const nodemailer = require('nodemailer');
const { all, one, run } = require('./db');

const COOKIE = 'lv_session';
const MAX_AGE = 30 * 24 * 60 * 60 * 1000;
const VERIFY_TTL = 24 * 60 * 60 * 1000;

function hash(pass, salt = crypto.randomBytes(16).toString('hex')) {
  return salt + ':' + crypto.scryptSync(String(pass), salt, 64).toString('hex');
}
function verify(pass, stored) {
  try {
    const [salt, hex] = String(stored).split(':');
    const a = Buffer.from(hex, 'hex');
    const b = crypto.scryptSync(String(pass), salt, 64);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch { return false; }
}
function parseCookies(header = '') {
  const out = {};
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}
function tokenFrom(req) {
  const h = req.headers.authorization || '';
  if (h.startsWith('Bearer ')) return h.slice(7);
  return parseCookies(req.headers.cookie)[COOKIE] || null;
}
async function userFor(req) {
  const token = tokenFrom(req);
  if (!token) return null;
  const s = await one('SELECT user_id,expires_at FROM sessions WHERE token=?', token);
  if (!s || s.expires_at < Date.now()) return null;
  return await one('SELECT id,email,name,created_at FROM users WHERE id=?', s.user_id);
}
async function auth(req, res, next) {
  const u = await userFor(req);
  if (!u) return res.status(401).json({ error: 'Faça login para continuar' });
  req.user = u;
  next();
}
function mailer() {
  const host = process.env.SMTP_HOST, user = process.env.SMTP_USER, pass = process.env.SMTP_PASS;
  const port = Number(process.env.SMTP_PORT || 587);
  if (!host || !user || !pass) return null;
  return nodemailer.createTransport({ host, port, secure: port === 465, auth: { user, pass } });
}
async function sendVerifyEmail(mail, token, name) {
  const base = (process.env.APP_URL || process.env.PUBLIC_URL || 'http://localhost:3000').replace(/\/$/, '');
  const link = base + '/api/auth/verify?token=' + encodeURIComponent(token);
  const t = mailer();
  const from = process.env.SMTP_FROM || process.env.SMTP_USER || 'no-reply@localhost';
  if (!t) { console.log('[auth] link de verificação para', mail, link); return { sent: false, link }; }
  await t.sendMail({
    from, to: mail, subject: 'Confirme seu e-mail - Master League Online',
    text: `Olá ${name || ''}, confirme seu e-mail: ${link}`,
    html: `<p>Olá ${name || ''},</p><p>Confirme seu e-mail no Master League Online:</p><p><a href="${link}">Confirmar e-mail</a></p><p>Se não foi você, ignore.</p>`,
  });
  return { sent: true };
}
async function issue(res, userId) {
  const token = crypto.randomBytes(32).toString('hex');
  await run('INSERT INTO sessions(token,user_id,expires_at) VALUES (?,?,?)', token, userId, Date.now() + MAX_AGE);
  res.cookie(COOKIE, token, { httpOnly: true, sameSite: 'lax', maxAge: MAX_AGE, secure: process.env.NODE_ENV === 'production' && process.env.HTTPS === '1' });
  return token;
}
async function register(req, res) {
  const { email, password, name } = req.body || {};
  if (!email || !password || String(password).length < 6) return res.status(400).json({ error: 'Informe e-mail e senha com pelo menos 6 caracteres' });
  const mail = String(email).trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(mail)) return res.status(400).json({ error: 'E-mail inválido' });
  if (await one('SELECT id FROM users WHERE email=?', mail)) return res.status(409).json({ error: 'Este e-mail já está cadastrado' });
  const nm = String(name || '').trim() || mail.split('@')[0];
  const vtoken = crypto.randomBytes(32).toString('hex');
  const vexp = Date.now() + VERIFY_TTL;
  const info = await run('INSERT INTO users(email,name,pass,created_at,email_verified,verify_token,verify_expires) VALUES (?,?,?,?,0,?,?)', mail, nm, hash(password), Date.now(), vtoken, vexp);
  try {
    const out = await sendVerifyEmail(mail, vtoken, nm);
    return res.json({ ok: true, needsVerify: true, user: { id: Number(info.lastInsertRowid), email: mail, name: nm }, ...(!mailer() ? { devVerifyLink: out.link } : {}), message: 'Cadastro criado. Verifique seu e-mail para entrar.' });
  } catch (e) {
    console.error('[auth] falha verificação:', e.message);
    return res.status(500).json({ error: 'Não foi possível enviar o e-mail de verificação.' });
  }
}
async function login(req, res) {
  const { email, password } = req.body || {};
  const u = await one('SELECT * FROM users WHERE email=?', String(email || '').trim().toLowerCase());
  if (!u || !verify(password, u.pass)) return res.status(401).json({ error: 'E-mail ou senha incorretos' });
  if (!u.email_verified) return res.status(403).json({ error: 'Confirme seu e-mail antes de entrar.', needsVerify: true, email: u.email });
  const token = await issue(res, u.id);
  res.json({ user: { id: u.id, email: u.email, name: u.name }, token });
}
async function resendVerify(req, res) {
  const mail = String(req.body?.email || '').trim().toLowerCase();
  const u = await one('SELECT id,email,name,email_verified FROM users WHERE email=?', mail);
  if (!u) return res.status(404).json({ error: 'Usuário não encontrado' });
  if (u.email_verified) return res.json({ ok: true, message: 'E-mail já verificado.' });
  const vtoken = crypto.randomBytes(32).toString('hex');
  const vexp = Date.now() + VERIFY_TTL;
  await run('UPDATE users SET verify_token=?,verify_expires=? WHERE id=?', vtoken, vexp, u.id);
  try {
    const out = await sendVerifyEmail(mail, vtoken, u.name);
    return res.json({ ok: true, message: 'E-mail de verificação reenviado.', ...(!mailer() ? { devVerifyLink: out.link } : {}) });
  } catch (e) { return res.status(500).json({ error: 'Não foi possível reenviar o e-mail.' }); }
}
async function verifyEmail(req, res) {
  const token = String(req.query?.token || req.body?.token || '');
  if (!token) return res.status(400).send('Token inválido');
  const u = await one('SELECT id,verify_expires,email_verified FROM users WHERE verify_token=?', token);
  if (!u) return res.status(400).send('Token inválido ou já usado');
  if (u.email_verified) return res.redirect('/?verified=1');
  if (u.verify_expires < Date.now()) return res.status(400).send('Token expirado. Solicite novo e-mail de verificação.');
  await run('UPDATE users SET email_verified=1,verify_token=NULL,verify_expires=NULL WHERE id=?', u.id);
  return res.redirect('/?verified=1');
}
async function logout(req, res) {
  const token = tokenFrom(req);
  if (token) await run('DELETE FROM sessions WHERE token=?', token);
  res.clearCookie(COOKIE);
  res.json({ ok: true });
}
async function me(req, res) {
  const leagueIds = ((await all('SELECT DISTINCT league_id FROM members WHERE user_id=?', req.user.id))).map(async r => r.league_id);
  res.json({ user: req.user, leagues: leagueIds });
}

module.exports = { auth, register, login, logout, me, userFor, tokenFrom, resendVerify, verifyEmail, COOKIE };
