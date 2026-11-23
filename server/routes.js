const crypto = require('node:crypto');
const express = require('express');
const { all, one, run, tx, notify, moneyLog, member } = require('./db');
const { auth } = require('./auth');
const snapshot = require('./snapshot');
const clubs = require('./clubs');
const sponsors = require('./sponsors');
const U = require('./util');

const router = express.Router();
const fail = (res, msg, code = 400) => res.status(code).json({ error: msg });


/* ---------------- imagens proxy/cache ---------------- */
const IMG_CACHE = new Map();
async function proxyImage(reqUrl, res, fallbackContentType='image/png') {
  try {
    const cached = IMG_CACHE.get(reqUrl);
    if (cached && cached.exp > Date.now()) {
      res.set('Content-Type', cached.type); res.set('Cache-Control', 'public, max-age=86400'); return res.send(cached.buf);
    }
    const r = await fetch(reqUrl, { headers: { 'Referer': 'https://sofifa.com/', 'User-Agent': 'Mozilla/5.0' } });
    if (!r.ok) return res.status(404).end();
    const buf = Buffer.from(await r.arrayBuffer());
    const type = r.headers.get('content-type') || fallbackContentType;
    IMG_CACHE.set(reqUrl, { buf, type, exp: Date.now() + 24*3600*1000 });
    res.set('Content-Type', type); res.set('Cache-Control', 'public, max-age=86400'); res.send(buf);
  } catch { res.status(404).end(); }
}
router.get('/img/face/:a/:b/:file', async (req, res) => {
  const a = String(req.params.a||'').replace(/\D/g,'').padStart(3,'0').slice(-3);
  const b = String(req.params.b||'').replace(/\D/g,'').padStart(3,'0').slice(-3);
  const file = String(req.params.file||'').replace(/[^0-9a-zA-Z_.-]/g,'');
  if (!/^\d+_\d+\.png$/i.test(file)) return res.status(400).end();
  await proxyImage(`https://cdn.sofifa.net/players/${a}/${b}/${file}`, res, 'image/png');
});
async function resolveClubAsset(club, kind) {
  const col = kind === 'kit' ? 'kit_url' : 'crest_url';
  if (club[col]) return club[col];
  try {
    const name = encodeURIComponent(club.name || '');
    const r = await fetch(`https://www.thesportsdb.com/api/v1/json/123/searchteams.php?t=${name}`, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!r.ok) return '';
    const d = await r.json();
    const t = d && d.teams && d.teams[0];
    const url = kind === 'kit' ? (t?.strEquipment || '') : (t?.strBadge || t?.strLogo || '');
    if (url) await run(`UPDATE clubs SET ${col}=? WHERE id=?`, url, club.id);
    return url;
  } catch { return ''; }
}
router.get('/img/club/:id/:kind', async (req, res) => {
  const kind = req.params.kind === 'kit' ? 'kit' : 'crest';
  const c = await one('SELECT id,name,crest_url,kit_url FROM clubs WHERE id=?', Number(req.params.id));
  if (!c) return res.status(404).end();
  let url = kind === 'kit' ? c.kit_url : c.crest_url;
  if (!url) url = await resolveClubAsset(c, kind);
  if (!url) return res.status(404).end();
  await proxyImage(url, res, 'image/png');
});
router.get('/img/player/:id/face', async (req, res) => {
  const p = await one('SELECT id,rid,face_url FROM players_base WHERE id=?', Number(req.params.id));
  if (!p) return res.status(404).end();
  if (p.face_url) return proxyImage(p.face_url, res, 'image/png');
  if (p.rid) {
    const rid = +p.rid; const a = String(Math.floor(rid/1000)).padStart(3,'0'); const b = String(rid%1000).padStart(3,'0');
    return proxyImage(`https://cdn.sofifa.net/players/${a}/${b}/26_120.png`, res, 'image/png');
  }
  return res.status(404).end();
});
async function leagueOf(req, res) {
  const l = await one('SELECT * FROM leagues WHERE id=?', Number(req.params.id));
  if (!l) { fail(res, 'Liga não encontrada', 404); return null; }
  return l;
}

async function myMember(l, req, res) {
  const m = await one('SELECT * FROM members WHERE league_id=? AND user_id=?', l.id, req.user.id);
  if (!m) { fail(res, 'Você não participa desta liga', 403); return null; }
  return m;
}

async function wantOwner(l, me, res) {
  if (l.owner_id !== me.user_id && me.slot !== 0) { fail(res, 'Só o dono da liga pode fazer isso', 403); return false; }
  return true;
}

async function snap(l, me) { return snapshot.build(l.id, me.user_id); }

async function poolFor(game) {
  return (await all('SELECT * FROM players_base WHERE game=? AND value>0', game)).map(U.pb);
}

async function insertCP(leagueId, memberId, p, draft) {
  const info = await run('INSERT INTO club_players(league_id,member_id,base_id,draft_pos,draft_ovr,draft_band) VALUES (?,?,?,?,?,?)',
    leagueId, memberId, p.i, draft ? draft.pos : null, draft ? draft.ovr : null, draft ? draft.band : null);
  return Number(info.lastInsertRowid);
}

async function dealRandom(l, members, pool) {
  const rnd = U.rngFrom(1000 + l.id);
  const used = new Set();
  const squadPos = ['GOL','GOL','ZAG','ZAG','ZAG','ZAG','LD','LD','LE','LE','VOL','VOL','MC','MC','MEI','MEI','PE','PD','ATA','ATA'];
  const byPos = {};
  pool.forEach(async p => { (byPos[p.p] = byPos[p.p] || []).push(p); });
  for (const k in byPos) byPos[k] = U.shuffle(byPos[k], rnd);
  const take = (pos, lo, hi) => {
    const a = (byPos[pos] || []).find(p => !used.has(p.i) && p.o >= lo && p.o <= hi);
    if (a) used.add(a.i);
    return a || null;
  };
  for (const m of members) {
    for (const pos of squadPos) { const p = take(pos, 66, 84) || take(pos, 60, 90); if (p) await insertCP(l.id, m.id, p, null); }
    await U.saveLineup(m.id, await U.autoLineup(l.id, m.id, m.formation));
  }
  for (const p of pool.filter(p => !used.has(p.i))) await insertCP(l.id, null, p, null);
}

async function draftTaken(leagueId) {
  return new Set((await all('SELECT base_id FROM draft_picks WHERE league_id=?', leagueId)).map(r => r.base_id));
}

async function draftTotal(l) {
  const n = await one('SELECT count(*) AS n FROM members WHERE league_id=?', l.id).n;
  return n * l.rounds;
}

async function pickBaseForRoll(game, pos, roll, taken, rnd) {
  const inBand = await all('SELECT * FROM players_base WHERE game=? AND pos=? AND ovr BETWEEN ? AND ? AND value>0', game, pos, roll.min, roll.max)
    .filter(p => !taken.has(p.id));
  let cand = inBand.filter(async p => p.ovr === roll.ovr);
  if (!cand.length) cand = inBand;
  if (!cand.length) {
    cand = await all('SELECT * FROM players_base WHERE game=? AND pos=? AND value>0', game, pos)
      .filter(p => !taken.has(p.id))
      .sort(async (a, b) => Math.abs(a.ovr - roll.ovr) - Math.abs(b.ovr - roll.ovr))
      .slice(0, 20);
  }
  if (!cand.length) return null;
  const p = cand[Math.floor(rnd() * cand.length)];
  return { baseId: p.id, name: p.name, club: p.club, nat: p.nat, pos, ovr: roll.ovr, band: roll.band };
}

async function generateDraftOptions(l, m, posArg) {
  const ctx = U.draftAllowedPos(l.id, m.id, m.formation);
  let pos = ctx.required || posArg || (ctx.allowed.length === 1 ? ctx.allowed[0] : null);
  if (!pos) pos = ctx.allowed[0];
  if (!ctx.allowed.includes(pos)) pos = ctx.required || ctx.allowed[0];
  const taken = await draftTaken(l.id);
  const rnd = U.rngFrom(l.id * 7919 + l.pick_index * 104729 + m.id * 97 + Date.now() % 9973);
  const options = [];
  const local = new Set(taken);
  const make = async () => {
    const roll = U.rollDraftOverall(rnd);
    roll.min = (U.DRAFT_BANDS.find(async b => b.label === roll.band) || {}).min || 45;
    roll.max = (U.DRAFT_BANDS.find(async b => b.label === roll.band) || {}).max || 99;
    return await pickBaseForRoll(l.game, pos, roll, local, rnd);
  };
  for (let i = 0; i < 5; i++) { const opt = make(); if (opt) { local.add(opt.baseId); options.push(opt); } }
  let guard = 0;
  while (options.length < 5 && guard++ < 30) { const opt = make(); if (opt && !options.some(async o => o.baseId === opt.baseId)) { local.add(opt.baseId); options.push(opt); } }
  return { pickIndex: l.pick_index, memberId: m.id, pos, options };
}

async function applyDraftPick(l, m, opt) {
  const ctx = U.draftAllowedPos(l.id, m.id, m.formation);
  await run('INSERT INTO draft_picks(league_id,pick,member_id,base_id,pos,ovr,band,created_at) VALUES (?,?,?,?,?,?,?,?)',
    l.id, l.pick_index + 1, m.id, opt.baseId, opt.pos, opt.ovr, opt.band, Date.now());
  const base = await one('SELECT * FROM players_base WHERE id=?', opt.baseId);
  if (base) {
    const cpId = insertCP(l.id, m.id, U.pb(base), { pos: opt.pos, ovr: opt.ovr, band: opt.band });
    if (ctx.mode === 'starter') {
      const slots = U.getLineup(m.id, m.formation);
      const form = U.formSlots(m.formation);
      let idx = form.findIndex((p, i) => !slots[i] && p === opt.pos);
      if (idx < 0) idx = form.findIndex((p, i) => !slots[i]);
      if (idx >= 0) { slots[idx] = cpId; U.saveLineup(m.id, slots); }
    }
  }
  await run('UPDATE leagues SET pick_index=pick_index+1,draft_options=NULL WHERE id=?', l.id);
  l.pick_index++;
  l.draft_options = null;
}

async function finishDraft(l) {
  await run('UPDATE leagues SET phase="season",round=0,draft_options=NULL,market_open=1 WHERE id=?', l.id);
  const used = await draftTaken(l.id);
  const remaining = (await Promise.all((await all('SELECT * FROM players_base WHERE game=? AND value>0', l.game)).map(async p=>U.pb(p)))).filter(p => !used.has(p.i));
  for (const p of remaining) await insertCP(l.id, null, p, null);
  for (const m of (await all('SELECT id,formation FROM members WHERE league_id=?', l.id))) {
    await run('UPDATE members SET balance=50000000 WHERE id=?', m.id);
    U.saveLineup(m.id, U.autoLineup(l.id, m.id, m.formation));
  }
  await ensureFixtures(l);
  for (const m of (await all('SELECT id FROM members WHERE league_id=?', l.id))) { await notify(m.id, 'Draft concluído! A temporada começou. Confira a aba Partidas e o Mercado.'); }
}

async function advanceDraft(l) {
  const total = draftTotal(l);
  if (l.phase === 'draft' && l.pick_index >= total) await finishDraft(l);
}

async function draftPending(l, me) {
  const order = JSON.parse(l.draft_order || '[]');
  if (l.phase !== 'draft' || l.pick_index >= draftTotal(l)) return null;
  if (U.teamAt(order, l.pick_index) !== me.slot) return null;
  let pending = null;
  try { pending = JSON.parse(l.draft_options || 'null'); } catch {}
  const ctx = U.draftAllowedPos(l.id, me.id, me.formation);
  if (pending && pending.pickIndex === l.pick_index && pending.memberId === me.id && ctx.allowed.includes(pending.pos)) return pending;
  if (ctx.required || ctx.allowed.length === 1) {
    pending = generateDraftOptions(l, me, ctx.required || ctx.allowed[0]);
    await run('UPDATE leagues SET draft_options=? WHERE id=?', JSON.stringify(pending), l.id);
    l.draft_options = JSON.stringify(pending);
    return pending;
  }
  if (pending && pending.pickIndex === l.pick_index && pending.memberId === me.id) {
    await run('UPDATE leagues SET draft_options=NULL WHERE id=?', l.id); l.draft_options = null;
  }
  return null;
}

async function standingsInit(leagueId, members) {
  for (const m of members) {
    await run('INSERT OR REPLACE INTO await standings(league_id,member_id,w,d,l,gf,ga) VALUES (?,?,0,0,0,0,0)', leagueId, m.id);
  }
}

async function setupLeague(l, members, startMode, pool) {
  standingsInit(l.id, members);
  if (startMode === 'random') {
    dealRandom(l, members, pool);
    await run('UPDATE leagues SET phase="season",draft_options=NULL,market_open=1 WHERE id=?', l.id);
    l.phase = 'season'; l.market_open = 1;
    for (const m of members) { await run('UPDATE members SET balance=50000000 WHERE id=?', m.id); }
    await ensureFixtures(l);
    for (const m of (await all('SELECT id FROM members WHERE league_id=?', l.id))) { await notify(m.id, 'Sorteio concluído! Mercado de transferências aberto.'); }
  } else {
    const order = U.shuffle(members.map(async m => m.slot), U.rngFrom(l.id * 13));
    await run('UPDATE leagues SET phase="draft",draft_order=?,pick_index=0,draft_options=NULL WHERE id=?', JSON.stringify(order), l.id);
    l.phase = 'draft'; l.pick_index = 0; l.draft_order = JSON.stringify(order); l.draft_options = null;
    await advanceDraft(l);
  }
}

/* ---------------- ligas ---------------- */

router.get('/leagues', auth, async (req, res) => {
  const rows = (await all(`SELECT l.id,l.name,l.game,l.invite,l.phase,l.season,l.round,l.owner_id,m.slot,m.team
    FROM members m JOIN leagues l ON l.id=m.league_id WHERE m.user_id=? ORDER BY m.joined_at DESC`, req.user.id)).map(r => ({ ...r, isOwner: r.owner_id === req.user.id || r.slot === 0 }));
  res.json({ leagues: rows });
});

router.post('/leagues', auth, async (req, res) => {
  const { name, game, startMode, rounds, team, coach, phone } = req.body || {};
  if (!U.GAMES[game]) return fail(res, 'Jogo inválido');
  const pool = await poolFor(game);
  if (pool.length < 500) return fail(res, 'Base de jogadores não importada. Rode npm run seed.');
  const r = (rounds==null || rounds==='') ? 15 : U.requireInt(rounds, 'rodadas', 5);
  const code = crypto.randomBytes(4).toString('hex').toUpperCase();
  const now = Date.now();
  const leagueId = await tx(async () => {
    const info = await run('INSERT INTO leagues(name,game,owner_id,invite,start_mode,rounds,phase,draft_order,pick_index,created_at) VALUES (?,?,?,?,?,?,\'brand\',\'[]\',0,?)',
      String(name || 'Minha Liga').slice(0, 40), game, req.user.id, code, startMode === 'random' ? 'random' : 'draft', Math.min(30, r), now);
    const id = Number(info.lastInsertRowid);
    const minfo = await run('INSERT INTO members(league_id,user_id,slot,team,coach,game_id,phone,is_ai,joined_at) VALUES (?,?,?,?,?,?,?,0,?)',
      id, req.user.id, 0, String(team || 'Meu Time FC').slice(0, 24), String(coach || req.user.name).slice(0, 30), '', String(phone || '').slice(0, 30), now);
    await run('INSERT OR IGNORE INTO standings(league_id,member_id) VALUES (?,?)', id, Number(minfo.lastInsertRowid));
    return id;
  });
  const l = await one('SELECT * FROM leagues WHERE id=?', leagueId);
  const me = await one('SELECT * FROM members WHERE league_id=? AND user_id=?', leagueId, req.user.id);
  res.json({ id: leagueId, invite: code, state: await snap(l, me) });
});

router.post('/leagues/join', auth, async (req, res) => {
  const code = String(req.body?.invite || '').trim().toUpperCase();
  const l = await one('SELECT * FROM leagues WHERE invite=?', code);
  if (!l) return fail(res, 'Código de convite inválido', 404);
  if (await one('SELECT id FROM members WHERE league_id=? AND user_id=?', l.id, req.user.id)) return fail(res, 'Você já participa desta liga');
  if (l.phase !== 'brand') return fail(res, 'Esta liga já começou');
  const slot = (await one('SELECT COALESCE(max(slot),-1) AS m FROM members WHERE league_id=?', l.id).m ?? -1) + 1;
  const info = await run('INSERT INTO members(league_id,user_id,slot,team,coach,game_id,phone,is_ai,joined_at) VALUES (?,?,?,?,?,?,?,0,?)',
    l.id, req.user.id, slot, String(req.body?.team || 'Meu Time').slice(0, 24), String(req.body?.coach || req.user.name).slice(0, 30), '', String(req.body?.phone || '').slice(0, 30), Date.now());
  const mid = Number(info.lastInsertRowid);
  await run('INSERT OR IGNORE INTO standings(league_id,member_id) VALUES (?,?)', l.id, mid);
  await notify(mid, 'Bem-vindo à liga ' + l.name + '!');
  const me = await one('SELECT * FROM members WHERE id=?', mid);
  res.json({ id: l.id, state: await snap(l, me) });
});

router.get('/leagues/:id', auth, async (req, res) => {
  const l = await leagueOf(req, res); if (!l) return;
  const me = await myMember(l, req, res); if (!me) return;
  if (l.phase === 'draft') await tx(async () => { draftPending(l, me); });
  let fresh = await one('SELECT * FROM leagues WHERE id=?', l.id);
  if (fresh.phase === 'season' && !await one('SELECT id FROM fixtures WHERE league_id=? AND competition="league" LIMIT 1', l.id)) {
    await tx(async () => { await ensureFixtures(fresh); });
    fresh = await one('SELECT * FROM leagues WHERE id=?', l.id);
  }
  res.json({ state: await snap(fresh, me) });
});

/* ---------------- escolha de clubes ---------------- */

async function resolveBrands(l) {
  const members = await all('SELECT * FROM members WHERE league_id=? ORDER BY slot', l.id);
  const assigned = new Map();
  const bids = await all(`SELECT b.*,c.name,c.short,c.country,c.color1,c.color2,c.price,c.strength
    FROM brand_bids b JOIN clubs c ON c.id=b.club_id WHERE b.league_id=? ORDER BY b.created_at ASC`, l.id);
  for (const b of bids) {
    if (assigned.size >= members.length || assigned.has(b.member_id) || [...assigned.values()].some(async x => x.id === b.club_id)) return;
    assigned.set(b.member_id, b);
  }
  const used = new Set([...assigned.values()].map(async b => b.club_id));
  const rest = await all('SELECT * FROM clubs WHERE game=? ORDER BY strength DESC', l.game);
  for (const m of members) {
    if (assigned.has(m.id)) return;
    const c = rest.find(async x => !used.has(x.id)) || rest[0];
    if (!c) return;
    assigned.set(m.id, { club_id: c.id, name: c.name });
    used.add(c.id);
  }
  for (const m of members) {
    const a = assigned.get(m.id);
    if (!a) return;
    await run('UPDATE members SET club_id=?,team=? WHERE id=?', a.club_id, String(a.name).slice(0, 30), m.id);
    await notify(m.id, 'Clube definido: ' + a.name + '!');
  }
  await run('DELETE FROM brand_bids WHERE league_id=?', l.id);
}

async function startAfterBrands(l) {
  const members = await all('SELECT * FROM members WHERE league_id=? ORDER BY slot', l.id);
  setupLeague(l, members, l.start_mode, await poolFor(l.game));
}

router.get('/leagues/:id/brands', auth, async (req, res) => {
  const l = await leagueOf(req, res); if (!l) return;
  const me = await myMember(l, req, res); if (!me) return;
  const q = U.norm(req.query.q || '');
  const options = (await all('SELECT * FROM clubs WHERE game=? ORDER BY strength DESC LIMIT 500', l.game)
    .filter(async c => !q || U.norm(c.name).includes(q) || U.norm(c.short).includes(q) || U.norm(c.country).includes(q))
    .slice(0, 200)).map(async c => {
      const d = clubs.clubDTO(c.id); d.taken = !!await one('SELECT id FROM brand_bids WHERE league_id=? AND club_id=?', l.id, c.id); return d;
    });
  res.json({ phase: l.phase, picks: await all('SELECT member_id,club_id FROM brand_bids WHERE league_id=?', l.id),
    options, club: clubs.clubDTO(me.club_id) });
});

router.post('/leagues/:id/brands/bid', auth, async (req, res) => {
  const l = await leagueOf(req, res); if (!l) return;
  const me = await myMember(l, req, res); if (!me) return;
  if (l.phase !== 'brand') return fail(res, 'A escolha de clubes já encerrou');
  const raw = req.body && (req.body.clubId ?? req.body.club_id ?? req.body.id ?? req.body.club);
  const clubId = Math.round(Number(String(raw ?? '').replace(/[^\d-]/g,'')));
  if (!Number.isInteger(clubId) || clubId < 1) return fail(res, 'Clube inválido');
  const c = await one('SELECT * FROM clubs WHERE id=? AND game=?', clubId, l.game);
  if (!c) return fail(res, 'Clube indisponível', 404);
  const mine = await one('SELECT club_id FROM brand_bids WHERE league_id=? AND member_id=?', l.id, me.id);
  if (mine && mine.club_id === clubId) return res.json({ state: await snap(l, me) });
  if (await one('SELECT id FROM brand_bids WHERE league_id=? AND club_id=? AND member_id<>?', l.id, clubId, me.id)) return fail(res, 'Este clube já foi escolhido');
  await tx(async () => {
    await run('DELETE FROM brand_bids WHERE league_id=? AND member_id=?', l.id, me.id);
    await run('INSERT INTO brand_bids(league_id,club_id,member_id,amount,created_at) VALUES (?,?,?,0,?)', l.id, clubId, me.id, Date.now());
    for (const m of (await all('SELECT id FROM members WHERE league_id=? AND id<>?', l.id, me.id))) await notify(m.id, 'Um técnico escolheu o clube ' + c.name);
  });
  res.json({ state: await snap(l, me) });
});

router.post('/leagues/:id/brands/close', auth, async (req, res) => {
  const l = await leagueOf(req, res); if (!l) return;
  const me = await myMember(l, req, res); if (!me) return;
  if (!wantOwner(l, me, res)) return;
  if (l.phase !== 'brand') return fail(res, 'A escolha de clubes já encerrou');
  const total = await one('SELECT count(*) AS n FROM members WHERE league_id=?', l.id).n;
  const picked = await one('SELECT count(*) AS n FROM brand_bids WHERE league_id=?', l.id).n;
  if (picked < total) return fail(res, 'Todos os técnicos precisam escolher um clube');
  await tx(async () => {
    resolveBrands(l);
    startAfterBrands(l);
  });
  const fresh = await one('SELECT * FROM leagues WHERE id=?', l.id);
  res.json({ ok: true, state: await snap(fresh, await one('SELECT * FROM members WHERE id=?', me.id)) });
});

/* ---------------- patrocínios ---------------- */

router.get('/leagues/:id/sponsors', auth, async (req, res) => {
  const l = await leagueOf(req, res); if (!l) return;
  const me = await myMember(l, req, res); if (!me) return;
  res.json({ catalog: sponsors.CATALOG, deals: await all('SELECT * FROM sponsor_deals WHERE league_id=? AND member_id=? ORDER BY id DESC', l.id, me.id) });
});

router.post('/leagues/:id/sponsors', auth, async (req, res) => {
  const l = await leagueOf(req, res); if (!l) return;
  const me = await myMember(l, req, res); if (!me) return;
  if (l.phase !== 'season') return fail(res, 'Patrocínios iniciam após o leilão e o draft');
  const s = sponsors.byId(String(req.body?.sponsorId || ''));
  if (!s) return fail(res, 'Patrocínio inválido', 404);
  const current = await one('SELECT * FROM sponsor_deals WHERE league_id=? AND member_id=? AND season=? AND status="ativo"', l.id, me.id, l.season);
  if (current && current.progress > 0) return fail(res, 'Sua meta atual já está em andamento');
  await tx(async () => {
    if (current) await run('DELETE FROM sponsor_deals WHERE id=?', current.id);
    await run(`INSERT INTO sponsor_deals(league_id,member_id,sponsor_id,goal_type,target,reward,progress,status,season,created_at)
      VALUES (?,?,?,?,?,?,0,"ativo",?,?)`, l.id, me.id, s.id, s.goalType, s.target, s.reward, l.season, Date.now());
    await notify(me.id, 'Patrocínio firmado com ' + s.name + ': ' + s.goal);
  });
  res.json({ ok: true, state: await snap(l, me) });
});

router.post('/leagues/:id/profile', auth, async (req, res) => {
  const l = await leagueOf(req, res); if (!l) return;
  const me = await myMember(l, req, res); if (!me) return;
  const b = req.body || {};
  const phone = b.phone != null ? String(b.phone).slice(0, 30) : (me.phone || '');
  const coach = b.coach != null ? String(b.coach).slice(0, 30) : me.coach;
  const team = b.team != null ? String(b.team).slice(0, 24) : me.team;
  await run('UPDATE members SET phone=?,coach=?,team=? WHERE id=?', phone, coach, team, me.id);
  res.json({ state: await snap(await one('SELECT * FROM leagues WHERE id=?', l.id), await one('SELECT * FROM members WHERE id=?', me.id)) });
});

router.patch('/leagues/:id/settings', auth, async (req, res) => {
  const l = await leagueOf(req, res); if (!l) return;
  const me = await myMember(l, req, res); if (!me) return;
  if (!wantOwner(l, me, res)) return;
  const b = req.body || {};
  if (b.name) await run('UPDATE leagues SET name=? WHERE id=?', String(b.name).slice(0, 40), l.id);
  if (b.rounds) await run('UPDATE leagues SET rounds=? WHERE id=?', Math.min(30, U.requireInt(b.rounds, 'rodadas', 5)), l.id);
  if (b.startMode) await run('UPDATE leagues SET start_mode=? WHERE id=?', b.startMode === 'random' ? 'random' : 'draft', l.id);
  res.json({ ok: true, state: await snap(await one('SELECT * FROM leagues WHERE id=?', l.id), me) });
});

router.post('/leagues/:id/reset', auth, async (req, res) => {
  const l = await leagueOf(req, res); if (!l) return;
  const me = await myMember(l, req, res); if (!me) return;
  if (!wantOwner(l, me, res)) return;
  const game = req.body?.game && U.GAMES[req.body.game] ? req.body.game : l.game;
  const startMode = req.body?.startMode || l.start_mode;
  const rounds = req.body?.rounds ? Math.min(30, U.requireInt(req.body.rounds, 'rodadas', 5)) : l.rounds;
  const pool = await poolFor(game);
  await tx(async () => {
    ['offers','fixtures','standings','auctions','loans','tx','lineups','draft_picks','club_players','brand_bids','sponsor_deals'].forEach(async t =>
      await run(`DELETE FROM ${t} WHERE league_id=?`, l.id));
    await run('DELETE FROM notifications WHERE member_id IN (SELECT id FROM members WHERE league_id=?)', l.id);
    await run('UPDATE leagues SET game=?,start_mode=?,rounds=?,phase="brand",season=1,round=0,cup_stage=0,draft_order="[]",pick_index=0,draft_options=NULL WHERE id=?', game, startMode, rounds, l.id);
    const members = await all('SELECT * FROM members WHERE league_id=? ORDER BY slot', l.id);
    for (const m of members) {
      await run('UPDATE members SET balance=50000000,formation="4-3-3",club_id=NULL,brand_budget=25000000 WHERE id=?', m.id);
      await run('INSERT OR IGNORE INTO standings(league_id,member_id) VALUES (?,?)', l.id, m.id);
    }
  });
  const fresh = await one('SELECT * FROM leagues WHERE id=?', l.id);
  res.json({ ok: true, state: await snap(fresh, me) });
});

/* ---------------- elenco ---------------- */

router.post('/leagues/:id/formation', auth, async (req, res) => {
  const l = await leagueOf(req, res); if (!l) return;
  const me = await myMember(l, req, res); if (!me) return;
  const f = String(req.body?.formation || '');
  if (!U.FORMS[f]) return fail(res, 'Formação inválida');
  await run('UPDATE members SET formation=? WHERE id=?', f, me.id);
  U.saveLineup(me.id, U.autoLineup(l.id, me.id, f));
  res.json({ state: await snap(l, me) });
});

router.post('/leagues/:id/lineup', auth, async (req, res) => {
  const l = await leagueOf(req, res); if (!l) return;
  const me = await myMember(l, req, res); if (!me) return;
  const slots = Array.isArray(req.body?.slots) ? req.body.slots : null;
  const need = U.FORMS[me.formation].length;
  if (!slots || slots.length !== need) return fail(res, 'Escalação inválida');
  const mine = new Set((await all('SELECT id FROM club_players WHERE league_id=? AND member_id=?', l.id, me.id)).map(p => p.id));
  const seen = new Set();
  const out = slots.map(async id => {
    if (id === null || id === undefined || id === '') return null;
    const n = Number(id);
    if (!mine.has(n) || seen.has(n)) throw new Error('Jogador inválido na escalação');
    seen.add(n); return n;
  });
  U.saveLineup(me.id, out);
  res.json({ state: await snap(l, me) });
});

router.post('/leagues/:id/lineup/auto', auth, async (req, res) => {
  const l = await leagueOf(req, res); if (!l) return;
  const me = await myMember(l, req, res); if (!me) return;
  U.saveLineup(me.id, U.autoLineup(l.id, me.id, me.formation));
  res.json({ state: await snap(l, me) });
});

/* ---------------- draft ---------------- */

router.post('/leagues/:id/draft/roll', auth, async (req, res) => {
  const l = await leagueOf(req, res); if (!l) return;
  const me = await myMember(l, req, res); if (!me) return;
  if (l.phase !== 'draft') return fail(res, 'O draft já terminou');
  const order = JSON.parse(l.draft_order || '[]');
  if (U.teamAt(order, l.pick_index) !== me.slot) return fail(res, 'Não é sua vez no draft');
  const pos = String(req.body?.pos || '').toUpperCase();
  const ctx = U.draftAllowedPos(l.id, me.id);
  if (!ctx.allowed.includes(pos)) return fail(res, 'Posição inválida para esta escolha');
  const pending = await tx(async () => {
    let po = null;
    try { po = JSON.parse(l.draft_options || 'null'); } catch {}
    if (!po || po.pickIndex !== l.pick_index || po.memberId !== me.id || po.pos !== pos) {
      po = generateDraftOptions(l, me, pos);
      await run('UPDATE leagues SET draft_options=? WHERE id=?', JSON.stringify(po), l.id);
      l.draft_options = JSON.stringify(po);
    }
    return po;
  });
  const fresh = await one('SELECT * FROM leagues WHERE id=?', l.id);
  res.json({ state: await snap(fresh, me), pending });
});

router.post('/leagues/:id/draft/pick', auth, async (req, res) => {
  const l = await leagueOf(req, res); if (!l) return;
  const me = await myMember(l, req, res); if (!me) return;
  if (l.phase !== 'draft') return fail(res, 'O draft já terminou');
  const order = JSON.parse(l.draft_order || '[]');
  if (U.teamAt(order, l.pick_index) !== me.slot) return fail(res, 'Não é sua vez no draft');
  const baseId = U.requireInt(req.body?.baseId, 'jogador', 1);
  let pending = null;
  try { pending = JSON.parse(l.draft_options || 'null'); } catch {}
  if (!pending || pending.pickIndex !== l.pick_index || pending.memberId !== me.id) return fail(res, 'Sorteie as opções primeiro');
  const opt = (pending.options || []).find(async o => Number(o.baseId) === baseId);
  if (!opt) return fail(res, 'Escolha uma das opções sorteadas');
  await tx(async () => {
    if (await one('SELECT id FROM draft_picks WHERE league_id=? AND base_id=?', l.id, baseId)) throw new Error('Jogador já escolhido');
    applyDraftPick(l, me, opt);
    await advanceDraft(l);
  });
  res.json({ state: await snap(await one('SELECT * FROM leagues WHERE id=?', l.id), me) });
});

router.post('/leagues/:id/draft/auto', auth, async (req, res) => {
  const l = await leagueOf(req, res); if (!l) return;
  const me = await myMember(l, req, res); if (!me) return;
  if (l.phase !== 'draft') return fail(res, 'O draft já terminou');
  const order = JSON.parse(l.draft_order || '[]');
  if (U.teamAt(order, l.pick_index) !== me.slot) return fail(res, 'Não é sua vez no draft');
  await tx(async () => {
    let pending = null;
    try { pending = JSON.parse(l.draft_options || 'null'); } catch {}
    if (!pending || pending.pickIndex !== l.pick_index || pending.memberId !== me.id) {
      const ctx = U.draftAllowedPos(l.id, me.id, me.formation);
      const pos = ctx.required || ctx.allowed[0];
      pending = generateDraftOptions(l, me, pos);
    }
    const opt = (pending.options || []).slice().sort(async (a, b) => b.ovr - a.ovr)[0];
    if (!opt) throw new Error('Sem jogadores disponíveis');
    applyDraftPick(l, me, opt);
    await advanceDraft(l);
  });
  res.json({ state: await snap(await one('SELECT * FROM leagues WHERE id=?', l.id), me) });
});

router.post('/leagues/:id/draft/all', auth, async (req, res) => {
  const l = await leagueOf(req, res); if (!l) return;
  const me = await myMember(l, req, res); if (!me) return;
  if (l.phase !== 'draft') return fail(res, 'O draft já terminou');
  if (!wantOwner(l, me, res)) return;
  await tx(async () => {
    const order = JSON.parse(l.draft_order || '[]');
    const total = draftTotal(l);
    let guard = 0;
    while (l.phase === 'draft' && l.pick_index < total && guard++ < 1200) {
      const slot = U.teamAt(order, l.pick_index);
      const m = await member(l.id, slot);
      if (!m) { await run('UPDATE leagues SET pick_index=pick_index+1,draft_options=NULL WHERE id=?', l.id); l.pick_index++; l.draft_options = null; continue; }
      let pending = null; try { pending = JSON.parse(l.draft_options || 'null'); } catch {}
      if (!pending || pending.pickIndex !== l.pick_index || pending.memberId !== m.id) {
        const ctx = U.draftAllowedPos(l.id, m.id, m.formation);
        pending = generateDraftOptions(l, m, ctx.required || ctx.allowed[0]);
      }
      const opt = (pending.options || []).slice().sort(async (a, b) => b.ovr - a.ovr)[0];
      if (!opt) { await run('UPDATE leagues SET pick_index=pick_index+1,draft_options=NULL WHERE id=?', l.id); l.pick_index++; l.draft_options = null; continue; }
      applyDraftPick(l, m, opt);
    }
    if (l.phase === 'draft' && l.pick_index >= total) await finishDraft(l);
  });
  res.json({ state: await snap(await one('SELECT * FROM leagues WHERE id=?', l.id), me) });
});

/* ---------------- mercado ---------------- */


router.post('/leagues/:id/market/toggle', auth, async (req, res) => {
  const l = await leagueOf(req, res); if (!l) return;
  const me = await myMember(l, req, res); if (!me) return;
  if (!wantOwner(l, me, res)) return;
  const next = l.market_open ? 0 : 1;
  await run('UPDATE leagues SET market_open=? WHERE id=?', next, l.id);
  for (const m of (await all('SELECT id FROM members WHERE league_id=?', l.id))) { await notify(m.id, next ? 'O mercado de transferências foi aberto!' : 'O mercado de transferências foi fechado.'); }
  res.json({ state: await snap(await one('SELECT * FROM leagues WHERE id=?', l.id), me) });
});
router.get('/leagues/:id/players', auth, async (req, res) => {
  const l = await leagueOf(req, res); if (!l) return;
  const me = await myMember(l, req, res); if (!me) return;
  const q = U.norm(req.query.q || '');
  const pos = String(req.query.pos || '');
  const players = (await all('SELECT * FROM players_base WHERE game=? AND value>0', l.game)
    .filter(async p => (!pos || p.pos === pos) && (!q || U.norm(p.name + ' ' + p.club + ' ' + p.nat).includes(q)))
    .sort(async (a, b) => b.ovr - a.ovr).slice(0, 60)).map(async p => {
      const cp = await one('SELECT cp.id,cp.status,m.slot,m.team FROM club_players cp LEFT JOIN members m ON m.id=cp.member_id WHERE cp.league_id=? AND cp.base_id=?', l.id, p.id);
      return { ...U.pb(p), owner: cp ? (cp.slot === me.slot ? 'me' : cp.slot === null ? 'free' : 'team') : 'none',
        ownerTeam: cp ? cp.team : null, cpId: cp ? cp.id : null };
    });
  res.json({ players, total: players.length });
});

router.post('/leagues/:id/buy', auth, async (req, res) => {
  const l = await leagueOf(req, res); if (!l) return;
  const me = await myMember(l, req, res); if (!me) return;
  if (!l.market_open) return fail(res, 'O mercado de transferências está fechado');
  const cp = await one('SELECT cp.*,b.name,b.value FROM club_players cp JOIN players_base b ON b.id=cp.base_id WHERE cp.id=? AND cp.league_id=?', U.requireInt(req.body?.playerId, 'jogador', 1), l.id);
  if (!cp || cp.member_id !== null) return fail(res, 'Jogador não está no mercado livre');
  if (me.balance < cp.value) return fail(res, 'Saldo insuficiente');
  await tx(async () => {
    await run('UPDATE club_players SET member_id=?,status="own" WHERE id=?', me.id, cp.id);
    await run('UPDATE members SET balance=balance-? WHERE id=?', cp.value, me.id);
    await moneyLog(l.id, me.id, 'Contratação · ' + cp.name, -cp.value);
  });
  res.json({ state: await snap(l, await one('SELECT * FROM members WHERE id=?', me.id)) });
});

router.post('/leagues/:id/sell', auth, async (req, res) => {
  const l = await leagueOf(req, res); if (!l) return;
  const me = await myMember(l, req, res); if (!me) return;
  if (!l.market_open) return fail(res, 'O mercado de transferências está fechado');
  const cpId = U.requireInt(req.body?.playerId, 'jogador', 1);
  const cp = await one('SELECT cp.*,b.name,b.value FROM club_players cp JOIN players_base b ON b.id=cp.base_id WHERE cp.id=? AND cp.league_id=?', cpId, l.id);
  if (!cp || cp.member_id !== me.id) return fail(res, 'O jogador não é seu');
  if (cp.status === 'loan') return fail(res, 'Jogador emprestado não pode ser vendido');
  if (await one('SELECT count(*) AS n FROM club_players WHERE league_id=? AND member_id=?', l.id, me.id).n <= 11) return fail(res, 'Mantenha ao menos 11 jogadores');
  const v = Math.round(cp.value * 0.8);
  await tx(async () => {
    await run('UPDATE club_players SET member_id=NULL,status="own" WHERE id=?', cp.id);
    await run('UPDATE members SET balance=balance+? WHERE id=?', v, me.id);
    await moneyLog(l.id, me.id, 'Venda · ' + cp.name, v);
    await run('UPDATE offers SET status="cancelada",resolved_at=? WHERE status="pendente" AND (player_id=? OR swap_id=?)', Date.now(), cp.id, cp.id);
    const slots = U.getLineup(me.id, me.formation).map(async x => x === cp.id ? null : x);
    U.saveLineup(me.id, slots);
  });
  res.json({ state: await snap(l, await one('SELECT * FROM members WHERE id=?', me.id)) });
});

async function resolveOffer(o, accept) {
  if (o.status !== 'pendente') return;
  const l = await one('SELECT * FROM leagues WHERE id=?', o.league_id);
  const from = await one('SELECT * FROM members WHERE id=?', o.from_id);
  const to = await one('SELECT * FROM members WHERE id=?', o.to_id);
  await tx(async () => {
    if (!accept) {
      if (o.kind !== 'precontract') await run('UPDATE members SET balance=balance+? WHERE id=?', o.amount, from.id);
      await run('UPDATE offers SET status="recusada",resolved_at=? WHERE id=?', Date.now(), o.id);
      await notify(from.id, to.team + ' recusou sua proposta por ' + o.p_name);
      return;
    }
    const cp = await one('SELECT * FROM club_players WHERE id=?', o.player_id);
    if (!cp || cp.member_id !== to.id) {
      await run('UPDATE offers SET status="cancelada",resolved_at=? WHERE id=?', Date.now(), o.id);
      if (o.kind !== 'precontract') await run('UPDATE members SET balance=balance+? WHERE id=?', o.amount, from.id);
      return;
    }
    if (o.amount > from.balance && o.kind !== 'precontract') {
      await run('UPDATE offers SET status="cancelada",resolved_at=? WHERE id=?', Date.now(), o.id);
      await notify(from.id, 'Proposta cancelada: saldo insuficiente');
      return;
    }
    if (o.kind === 'precontract') {
      await run('UPDATE offers SET status="aceita",resolved_at=?,note=? WHERE id=?', Date.now(), String(l.season + 1), o.id);
      await notify(to.id, from.team + ' assinou um pré-contrato com ' + o.p_name + ' para a próxima temporada');
      await notify(from.id, 'Pré-contrato aceito: ' + o.p_name + ' chega na próxima temporada');
      return;
    }
    await run('UPDATE members SET balance=balance+? WHERE id=?', o.amount, to.id);
    if (o.kind === 'loan') {
      await run('UPDATE club_players SET member_id=?,status="loan" WHERE id=?', from.id, cp.id);
      await run('INSERT INTO loans(league_id,player_id,from_id,to_id,ends_round,fee) VALUES (?,?,?,?,?,?)',
        l.id, cp.id, to.id, from.id, l.round + (Number(o.note) || 5), o.amount);
      await moneyLog(l.id, from.id, 'Empréstimo · ' + o.p_name, -o.amount);
      await notify(from.id, 'Empréstimo de ' + o.p_name + ' confirmado por ' + (Number(o.note) || 5) + ' rodadas');
    } else {
      await run('UPDATE club_players SET member_id=?,status="own" WHERE id=?', from.id, cp.id);
      if (o.swap_id) {
        const sw = await one('SELECT * FROM club_players WHERE id=?', o.swap_id);
        if (sw && sw.member_id === from.id) {
          await run('UPDATE club_players SET member_id=?,status="own" WHERE id=?', to.id, sw.id);
          const swName = await one('SELECT b.name FROM players_base b WHERE b.id=?', sw.base_id)?.name || '';
          await moneyLog(l.id, to.id, 'Troca recebida · ' + swName, 0);
        }
      }
      await moneyLog(l.id, from.id, 'Contratação · ' + o.p_name, -o.amount);
      await notify(from.id, o.kind === 'buyout' ? 'Multa paga: ' + o.p_name + ' é seu!' : 'Negócio fechado: ' + o.p_name + ' é seu!');
      await notify(to.id, o.p_name + ' vendido para ' + from.team);
    }
    await run('UPDATE offers SET status="aceita",resolved_at=? WHERE id=?', Date.now(), o.id);
    await run('UPDATE offers SET status="cancelada",resolved_at=? WHERE status="pendente" AND (player_id=? OR swap_id=?)', Date.now(), cp.id, o.swap_id || -1);
    const slots = U.getLineup(from.id, from.formation).map(async x => x === o.swap_id ? null : x);
    U.saveLineup(from.id, slots);
  });
}

router.post('/leagues/:id/offers', auth, async (req, res) => {
  const l = await leagueOf(req, res); if (!l) return;
  const me = await myMember(l, req, res); if (!me) return;
  if (!l.market_open) return fail(res, 'O mercado de transferências está fechado');
  if (l.phase !== 'season') return fail(res, 'A liga ainda está no draft');
  const b = req.body || {};
  const to = await member(l.id, U.requireInt(b.toSlot, 'time'));
  if (!to || to.id === me.id) return fail(res, 'Time de destino inválido');
  const cp = await one('SELECT cp.*,b.name,b.value FROM club_players cp JOIN players_base b ON b.id=cp.base_id WHERE cp.id=? AND cp.league_id=?', U.requireInt(b.playerId, 'jogador', 1), l.id);
  if (!cp || cp.member_id !== to.id) return fail(res, 'Esse jogador pertence a outro time');
  const kind = ['transfer','buyout','loan','precontract'].includes(b.kind) ? b.kind : 'transfer';
  const amount = kind === 'precontract' ? 0 : Math.max(0, U.requireInt(b.amount || 0, 'valor'));
  const swapId = b.swapId ? U.requireInt(b.swapId, 'troca', 1) : null;
  if (kind === 'buyout' && amount < Math.round(cp.value * 1.3)) return fail(res, 'A multa mínima é ' + Math.round(cp.value * 1.3));
  if (amount > me.balance) return fail(res, 'Valor acima do seu saldo');
  if (swapId) {
    const sw = await one('SELECT * FROM club_players WHERE id=? AND member_id=?', swapId, me.id);
    if (!sw || sw.id === cp.id) return fail(res, 'Jogador de troca inválido');
  }
  if (await one(`SELECT id FROM offers WHERE league_id=? AND from_id=? AND player_id=? AND status="pendente"`, l.id, me.id, cp.id))
    return fail(res, 'Você já tem uma proposta pendente por esse jogador');
  const toSlot = to.slot;
  let oid;
  await tx(async () => {
    if (amount) await run('UPDATE members SET balance=balance-? WHERE id=?', amount, me.id);
    const info = await run(`INSERT INTO offers(league_id,from_id,to_id,kind,player_id,swap_id,amount,status,note,created_at)
      VALUES (?,?,?,?,?,?,?,"pendente",?,?)`, l.id, me.id, to.id, kind, cp.id, swapId, amount,
      kind === 'loan' ? String(b.loanRounds || 5) : null, Date.now());
    oid = Number(info.lastInsertRowid);
    await moneyLog(l.id, me.id, 'Proposta enviada · ' + cp.name, -amount);
  });
  const o = await one('SELECT o.*,b.name AS p_name FROM offers o JOIN club_players cp ON cp.id=o.player_id JOIN players_base b ON b.id=cp.base_id WHERE o.id=?', oid);
  await notify(to.id, 'Proposta de ' + me.team + ' por ' + (o ? o.p_name : 'jogador'));
  res.json({ state: await snap(l, await one('SELECT * FROM members WHERE id=?', me.id)) });
});

async function offerFor(req, res) {
  const l = await leagueOf(req, res); if (!l) return null;
  const me = await myMember(l, req, res); if (!me) return null;
  const o = await one(`SELECT o.*,b.name AS p_name FROM offers o JOIN club_players cp ON cp.id=o.player_id JOIN players_base b ON b.id=cp.base_id WHERE o.id=? AND o.league_id=?`, Number(req.params.oid), l.id);
  if (!o) { fail(res, 'Proposta não encontrada', 404); return null; }
  return { l, me, o };
}

router.post('/leagues/:id/offers/:oid/respond', auth, async (req, res) => {
  const x = offerFor(req, res); if (!x) return;
  if (x.o.to_id !== x.me.id) return fail(res, 'Essa proposta não é para você', 403);
  resolveOffer(x.o, !!req.body?.accept);
  res.json({ state: await snap(x.l, await one('SELECT * FROM members WHERE id=?', x.me.id)) });
});

router.post('/leagues/:id/offers/:oid/cancel', auth, async (req, res) => {
  const x = offerFor(req, res); if (!x) return;
  if (x.o.from_id !== x.me.id) return fail(res, 'Você não enviou essa proposta', 403);
  await tx(async () => {
    if (x.o.status === 'pendente' && x.o.kind !== 'precontract')
      await run('UPDATE members SET balance=balance+? WHERE id=?', x.o.amount, x.me.id);
    await run('UPDATE offers SET status="cancelada",resolved_at=? WHERE id=?', Date.now(), x.o.id);
  });
  res.json({ state: await snap(x.l, await one('SELECT * FROM members WHERE id=?', x.me.id)) });
});

router.post('/leagues/:id/auctions', auth, async (req, res) => {
  const l = await leagueOf(req, res); if (!l) return;
  const me = await myMember(l, req, res); if (!me) return;
  if (!l.market_open) return fail(res, 'O mercado de transferências está fechado');
  if (!wantOwner(l, me, res)) return;
  const cp = await one('SELECT cp.*,b.name FROM club_players cp JOIN players_base b ON b.id=cp.base_id WHERE cp.id=? AND cp.league_id=? AND cp.member_id IS NULL', U.requireInt(req.body?.playerId, 'jogador', 1), l.id);
  if (!cp) return fail(res, 'Escolha um jogador livre');
  if (await one('SELECT id FROM auctions WHERE league_id=? AND player_id=? AND status="aberta"', l.id, cp.id)) return fail(res, 'Já existe um leilão para esse jogador');
  const minutes = Math.min(1440, Math.max(1, U.requireInt(req.body?.minutes || 30, 'duração', 1)));
  await run('INSERT INTO auctions(league_id,player_id,ends_at,created_at) VALUES (?,?,?,?)', l.id, cp.id, Date.now() + minutes * 60000, Date.now());
  for (const m of (await all('SELECT id FROM members WHERE league_id=?', l.id))) { await notify(m.id, 'Leilão aberto: ' + cp.name); }
  res.json({ state: await snap(l, me) });
});

router.post('/leagues/:id/auctions/:aid/bid', auth, async (req, res) => {
  const l = await leagueOf(req, res); if (!l) return;
  const me = await myMember(l, req, res); if (!me) return;
  const a = await one('SELECT * FROM auctions WHERE id=? AND league_id=?', Number(req.params.aid), l.id);
  if (!a || a.status !== 'aberta' || a.ends_at < Date.now()) return fail(res, 'Leilão encerrado');
  const amount = U.requireInt(req.body?.amount, 'lance', 1);
  const top = await one('SELECT max(amount) AS m FROM bids WHERE auction_id=?', a.id)?.m || 0;
  if (amount <= top) return fail(res, 'Seu lance deve ser maior que ' + top);
  if (amount > me.balance) return fail(res, 'Saldo insuficiente');
  await run('INSERT INTO bids(auction_id,member_id,amount,created_at) VALUES (?,?,?,?)', a.id, me.id, amount, Date.now());
  res.json({ state: await snap(l, me) });
});

async function closeAuction(a) {
  if (!a || a.status !== 'aberta') return;
  const top = await one('SELECT * FROM bids WHERE auction_id=? ORDER BY amount DESC LIMIT 1', a.id);
  await tx(async () => {
    if (top) {
      await run('UPDATE club_players SET member_id=? WHERE id=? AND member_id IS NULL', top.member_id, a.player_id);
      await run('UPDATE members SET balance=balance-? WHERE id=?', top.amount, top.member_id);
      const p = await one('SELECT b.name FROM club_players cp JOIN players_base b ON b.id=cp.base_id WHERE cp.id=?', a.player_id);
      await moneyLog(a.league_id, top.member_id, 'Leilão · ' + p?.name, -top.amount);
      await notify(top.member_id, 'Você ganhou o leilão de ' + p?.name);
    }
    await run('UPDATE auctions SET status="encerrada",winner_id=?,winner_amount=? WHERE id=?', top ? top.member_id : null, top ? top.amount : 0, a.id);
  });
}

router.post('/leagues/:id/auctions/:aid/close', auth, async (req, res) => {
  const l = await leagueOf(req, res); if (!l) return;
  const me = await myMember(l, req, res); if (!me) return;
  const a = await one('SELECT * FROM auctions WHERE id=? AND league_id=?', Number(req.params.aid), l.id);
  if (!a) return fail(res, 'Leilão não encontrado', 404);
  await closeAuction(a);
  res.json({ state: await snap(l, me) });
});

/* ---------------- jogos, copas e amistosos ---------------- */

async function rotate(a) { return [a[a.length - 1], ...a.slice(0, -1)]; }

async function scheduleRounds(l) {
  const n = await one('SELECT count(*) AS n FROM members WHERE league_id=?', l.id).n;
  return Math.max(1, (n % 2 === 0 ? n - 1 : n) * 2);
}

async function buildFixtures(l) {
  const ids = (await all('SELECT id FROM members WHERE league_id=? ORDER BY slot', l.id)).map(async m => m.id);
  if (ids.length < 2) return;
  const n = ids.length, perLeg = n % 2 === 0 ? n - 1 : n;
  let seq = [...ids];
  const rows = [];
  for (let r = 1; r <= perLeg * 2; r++) {
    for (let i = 0; i < Math.floor(n / 2); i++) {
      const h = seq[i], a = seq[n - 1 - i];
      if (h === a) continue;
      const second = r > perLeg;
      rows.push([l.id, 'league', r, second ? a : h, second ? h : a, second ? 2 : 1, 'pendente']);
    }
    seq = rotate(seq);
  }
  for (const row of rows) { await run(`INSERT INTO fixtures(league_id,competition,round,home_id,away_id,leg,status) VALUES (?,?,?,?,?,?,?)`, ...row); }
}

async function ensureFixtures(l) {
  const has = await one('SELECT id FROM fixtures WHERE league_id=? AND competition="league" LIMIT 1', l.id);
  if (has) return;
  buildFixtures(l);
}

async function roundFixtures(l) {
  return await all('SELECT * FROM fixtures WHERE league_id=? AND competition="league" AND round=? AND status="pendente" ORDER BY id', l.id, l.round);
}


async function normalizeEvents(raw) {
  const arr = v => Array.isArray(v) ? v : [];
  const str = v => String(v == null ? '' : v).trim().slice(0, 60);
  const min = v => { const n = Number(v); return Number.isFinite(n) ? Math.max(1, Math.min(120, Math.round(n))) : 1; };
  return {
    goals: arr(raw && raw.goals).slice(0, 40).map(async g => ({ pid: Number(g.pid) || null, name: str(g.name), minute: min(g.minute), assistPid: Number(g.assistPid) || null, assistName: str(g.assistName) })).filter(async g => g.name),
    cards: arr(raw && raw.cards).slice(0, 40).map(async c => ({ pid: Number(c.pid) || null, name: str(c.name), minute: min(c.minute), type: c.type === 'vermelho' ? 'vermelho' : 'amarelo' })).filter(async c => c.name),
    injuries: arr(raw && raw.injuries).slice(0, 20).map(async i => ({ pid: Number(i.pid) || null, name: str(i.name), minute: min(i.minute) })).filter(async i => i.name)
  };
}

async function cleanPhoto(v) {
  if (v === null || v === '') return null;
  const s = String(v);
  if (s.length > 3200000 || !/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=\r\n]+$/.test(s)) return false;
  return s;
}

router.post('/leagues/:id/fixtures/generate', auth, async (req, res) => {
  const l = await leagueOf(req, res); if (!l) return;
  const me = await myMember(l, req, res); if (!me) return;
  if (l.phase !== 'season') return fail(res, 'A liga ainda estǭ no draft');
  if (await one('SELECT id FROM fixtures WHERE league_id=? AND competition="league" LIMIT 1', l.id)) return fail(res, 'Turno e returno jǭ foram gerados');
  await tx(async () => {
    await ensureFixtures(l);
    await notify(me.id, 'Turno e returno gerados. Acesse Partidas para acompanhar.');
  });
  res.json({ state: await snap(await one('SELECT * FROM leagues WHERE id=?', l.id), me) });
});


router.post('/leagues/:id/fixtures/:fid/report', auth, async (req, res) => {
  const l = await leagueOf(req, res); if (!l) return;
  const me = await myMember(l, req, res); if (!me) return;
  const fid = U.requireInt(req.params.fid, 'partida');
  const f = await one('SELECT * FROM fixtures WHERE id=? AND league_id=?', fid, l.id);
  if (!f) return fail(res, 'Partida não encontrada', 404);
  const body = req.body || {};
  const events = normalizeEvents(body.events);
  const hasPhoto = Object.prototype.hasOwnProperty.call(body, 'photo');
  const photo = hasPhoto ? cleanPhoto(body.photo) : undefined;
  if (photo === false) return fail(res, 'Use uma imagem JPG, PNG ou WEBP de até 2 MB');
  const note = String(body.note || '').trim().slice(0, 400);
  const oldRep = await one('SELECT photo FROM match_reports WHERE fixture_id=?', f.id);
  const finalPhoto = photo === undefined ? (oldRep ? oldRep.photo : null) : photo;
  const hsRaw = body.homeScore ?? body.hs ?? body.home_score;
  const asRaw = body.awayScore ?? body.as ?? body.away_score;
  await tx(async () => {
    if (f.status !== 'jogado') {
      if (hsRaw === undefined || hsRaw === null || hsRaw === '' || asRaw === undefined || asRaw === null || asRaw === '') {
        throw new Error('Informe o placar da partida');
      }
      const hs = Math.max(0, Math.min(99, Math.round(Number(hsRaw))));
      const as = Math.max(0, Math.min(99, Math.round(Number(asRaw))));
      if (!Number.isFinite(hs) || !Number.isFinite(as)) throw new Error('Placar inválido');
      await run('UPDATE fixtures SET home_score=?,away_score=?,status="jogado",played_at=? WHERE id=?', hs, as, Date.now(), f.id);
      if (f.competition === 'league') {
        const up = async (id, gf, ga) => {
          const r = await one('SELECT * FROM standings WHERE league_id=? AND member_id=?', l.id, id);
          if (!r) return;
          const w = r.w + (gf > ga ? 1 : 0), d = r.d + (gf === ga ? 1 : 0), lo = r.l + (gf < ga ? 1 : 0);
          await run('UPDATE standings SET w=?,d=?,l=?,gf=?,ga=? WHERE league_id=? AND member_id=?', w, d, lo, r.gf + gf, r.ga + ga, l.id, id);
        };
        up(f.home_id, hs, as); up(f.away_id, as, hs);
      }
    }
    await run(`INSERT INTO match_reports(fixture_id,league_id,events,photo,note,updated_at) VALUES (?,?,?,?,?,?)
      ON CONFLICT(fixture_id) DO UPDATE SET events=excluded.events,photo=excluded.photo,note=excluded.note,updated_at=excluded.updated_at`,
      f.id, l.id, JSON.stringify(events), finalPhoto, note, Date.now());
  });
  res.json({ state: await snap(await one('SELECT * FROM leagues WHERE id=?', l.id), me) });
});

router.delete('/leagues/:id', auth, async (req, res) => {
  const l = await leagueOf(req, res); if (!l) return;
  const me = await myMember(l, req, res); if (!me) return;
  if (!wantOwner(l, me, res)) return;
  const name = l.name;
  await tx(async () => {
    await run('DELETE FROM bids WHERE auction_id IN (SELECT id FROM auctions WHERE league_id=?)', l.id);
    await run('DELETE FROM match_reports WHERE league_id=?', l.id);
    await run('DELETE FROM fixtures WHERE league_id=?', l.id);
    await run('DELETE FROM offers WHERE league_id=?', l.id);
    await run('DELETE FROM loans WHERE league_id=?', l.id);
    await run('DELETE FROM auctions WHERE league_id=?', l.id);
    await run('DELETE FROM draft_picks WHERE league_id=?', l.id);
    await run('DELETE FROM brand_bids WHERE league_id=?', l.id);
    await run('DELETE FROM sponsor_deals WHERE league_id=?', l.id);
    await run('DELETE FROM tx WHERE league_id=?', l.id);
    await run('DELETE FROM standings WHERE league_id=?', l.id);
    await run('DELETE FROM lineups WHERE member_id IN (SELECT id FROM members WHERE league_id=?)', l.id);
    await run('DELETE FROM notifications WHERE member_id IN (SELECT id FROM members WHERE league_id=?)', l.id);
    await run('DELETE FROM club_players WHERE league_id=?', l.id);
    await run('DELETE FROM members WHERE league_id=?', l.id);
    await run('DELETE FROM leagues WHERE id=?', l.id);
  });
  res.json({ ok: true, name });
});

async function rollSeason(l) {
  const pcs = await all(`SELECT o.*,b.name FROM offers o JOIN club_players cp ON cp.id=o.player_id JOIN players_base b ON b.id=cp.base_id
    WHERE o.league_id=? AND o.kind="precontract" AND o.status="aceita" AND CAST(o.note AS INTEGER)<=?`, l.id, l.season + 1);
  for (const o of pcs) {
    const cp = await one('SELECT * FROM club_players WHERE id=?', o.player_id);
    if (cp && cp.member_id !== o.from_id) {
      await run('UPDATE club_players SET member_id=?,status="own" WHERE id=?', o.from_id, cp.id);
      await notify(o.from_id, 'Pré-contrato efetivado: ' + o.name);
    }
  }
  await run('DELETE FROM standings WHERE league_id=?', l.id);
  for (const m of (await all('SELECT id FROM members WHERE league_id=?', l.id))) {
    await run('INSERT INTO await standings(league_id,member_id) VALUES (?,?)', l.id, m.id);
  }
  await run('DELETE FROM fixtures WHERE league_id=?', l.id);
}

router.post('/leagues/:id/friendlies', auth, async (req, res) => {
  const l = await leagueOf(req, res); if (!l) return;
  const me = await myMember(l, req, res); if (!me) return;
  const to = await member(l.id, U.requireInt(req.body?.toSlot, 'time'));
  if (!to || to.id === me.id) return fail(res, 'Adversário inválido');
  await run('INSERT INTO fixtures(league_id,competition,round,home_id,away_id,status) VALUES (?, "friendly", ?, ?, ?, "pendente")', l.id, l.round, me.id, to.id);
  await notify(to.id, me.team + ' propôs um amistoso. Aceite e marquem o jogo na aba Partidas.');
  res.json({ state: await snap(l, me) });
});

router.post('/leagues/:id/friendlies/:fid/respond', auth, async (req, res) => {
  const l = await leagueOf(req, res); if (!l) return;
  const me = await myMember(l, req, res); if (!me) return;
  const f = await one('SELECT * FROM fixtures WHERE id=? AND league_id=? AND competition="friendly" AND status="pendente"', Number(req.params.fid), l.id);
  if (!f || f.away_id !== me.id) return fail(res, 'Convite não encontrado', 404);
  if (req.body?.accept) {
    await run('UPDATE fixtures SET status="aceito" WHERE id=?', f.id);
    await notify(f.home_id, me.team + ' aceitou o amistoso. Marquem o jogo pela aba Partidas.');
    res.json({ state: await snap(l, me) });
  } else {
    await run('UPDATE fixtures SET status="recusado" WHERE id=?', f.id);
    await notify(f.home_id, me.team + ' recusou o amistoso.');
    res.json({ state: await snap(l, me) });
  }
});



/* ---------------- notificações ---------------- */

router.post('/leagues/:id/notifications/read', auth, async (req, res) => {
  const l = await leagueOf(req, res); if (!l) return;
  const me = await myMember(l, req, res); if (!me) return;
  await run('UPDATE notifications SET read=1 WHERE member_id=?', me.id);
  res.json({ ok: true });
});

module.exports = { router, closeAuction, all };
