const { all, one, run } = require('./db');

const GAMES = {
  fc26: { name: 'EA FC 26' },
  fc27: { name: 'EA FC 27' },
  efoot: { name: 'eFootball' },
};

const FORMS = {
  '4-3-3': [['ATA',50,12],['PE',18,19],['PD',82,19],['MC',28,45],['VOL',50,55],['MC',72,45],['LE',13,72],['ZAG',37,77],['ZAG',63,77],['LD',87,72],['GOL',50,91]],
  '4-4-2': [['ATA',38,13],['ATA',62,13],['PE',13,38],['MC',38,48],['MC',62,48],['PD',87,38],['LE',13,72],['ZAG',37,77],['ZAG',63,77],['LD',87,72],['GOL',50,91]],
  '4-2-3-1': [['ATA',50,12],['PE',18,31],['MEI',50,31],['PD',82,31],['VOL',36,53],['VOL',64,53],['LE',13,72],['ZAG',37,77],['ZAG',63,77],['LD',87,72],['GOL',50,91]],
  '3-5-2': [['ATA',38,13],['ATA',62,13],['LE',10,40],['MC',30,44],['MEI',50,31],['MC',70,44],['LD',90,40],['ZAG',24,75],['ZAG',50,78],['ZAG',76,75],['GOL',50,91]],
};


const MINQ = { GOL:2, ZAG:3, LD:1, LE:1, VOL:1, MC:2, MEI:1, PE:1, PD:1, ATA:2 };
const DRAFT_POS = ['GOL','ZAG','LD','LE','VOL','MC','MEI','PD','PE','ATA'];
const DRAFT_STARTER_POS = ['GOL','ZAG','ZAG','LD','LE','VOL','VOL','MC','MEI','ATA','ATA'];
const DRAFT_BANDS = [
  { label: '90-99', min: 90, max: 99, p: 0.03 },
  { label: '85-89', min: 85, max: 89, p: 0.07 },
  { label: '80-84', min: 80, max: 84, p: 0.15 },
  { label: '75-79', min: 75, max: 79, p: 0.20 },
  { label: '70-74', min: 70, max: 74, p: 0.20 },
  { label: '65-69', min: 65, max: 69, p: 0.15 },
  { label: '60-64', min: 60, max: 64, p: 0.10 },
  { label: '45-59', min: 45, max: 59, p: 0.10 },
];

function rngFrom(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function norm(s) {
  return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function roundK(n) { return Math.round(n / 1000) * 1000; }

function shuffle(arr, rnd = Math.random) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function pb(row) {
  if (!row) return null;
  return {
    i: row.id, rid: row.rid, n: row.name, p: row.pos, ps: row.ps, o: row.ovr,
    t: row.pot, a: row.age, v: row.value, w: row.wage, c: row.club,
    l: row.liga, nt: row.nat,
  };
}

async function loadBase(game) {
  return (await all('SELECT * FROM players_base WHERE game=? AND value>0 AND ovr BETWEEN 60 AND 94', game)).map(pb);
}

function rollDraftOverall(rnd = Math.random) {
  let x = rnd(), acc = 0, band = DRAFT_BANDS[DRAFT_BANDS.length - 1];
  for (const b of DRAFT_BANDS) { acc += b.p; if (x < acc) { band = b; break; } }
  const ovr = band.min + Math.floor(rnd() * (band.max - band.min + 1));
  return { band: band.label, ovr };
}

async function draftPickCount(leagueId, memberId) {
  return (await one('SELECT count(*) AS n FROM draft_picks WHERE league_id=? AND member_id=?', leagueId, memberId) || { n: 0 }).n;
}

async function draftAllowedPos(leagueId, memberId, formation) {
  const n = draftPickCount(leagueId, memberId);
  if (n < 11) {
    const f = formSlots(formation);
    const slots = await getLineup(memberId, formation);
    const emptySlots = f.map(async (pos, i) => slots[i] ? null : { i, pos }).filter(Boolean);
    return { mode: 'starter', n, required: null, allowed: [...new Set(emptySlots.map(async x => x.pos))], emptySlots };
  }
  if (n === 11) return { mode: 'reserve_gk', n, required: 'GOL', allowed: ['GOL'], emptySlots: [] };
  return { mode: 'reserve', n, required: null, allowed: DRAFT_POS.slice(), emptySlots: [] };
}

function formSlots(formation) {
  return (FORMS[formation] || FORMS['4-3-3']).map(async s => s[0]);
}

function teamAt(order, k) {
  const NT = order.length;
  const r = Math.floor(k / NT), i = k % NT;
  return r % 2 === 0 ? order[i] : order[NT - 1 - i];
}

async function getLineup(memberId, formation) {
  const row = await one('SELECT slots FROM lineups WHERE member_id=?', memberId);
  let slots = [];
  if (row) { try { slots = JSON.parse(row.slots); } catch { slots = []; } }
  const want = (FORMS[formation] || FORMS['4-3-3']).length;
  return Array.from({ length: want }, (_, i) => slots[i] || null);
}

async function saveLineup(memberId, slots) {
  await run('INSERT INTO lineups(member_id,slots) VALUES (?,?) ON CONFLICT(member_id) DO UPDATE SET slots=excluded.slots', memberId, JSON.stringify(slots));
}

async function ownedPlayers(leagueId, memberId) {
  return await all(`SELECT cp.id AS id, b.rid AS rid, b.name AS name, b.pos AS p, b.ovr AS o, b.age AS a,
    b.value AS v, b.wage AS w, b.club AS c, b.nat AS nt, cp.goals AS goals, cp.assists AS assists,
    cp.draft_pos AS dp, cp.draft_ovr AS dovr, cp.draft_band AS dband
    FROM club_players cp JOIN players_base b ON b.id=cp.base_id
    WHERE cp.league_id=? AND cp.member_id=? AND cp.status="own"`, leagueId, memberId)
    .map(async r => ({
      id: r.id, rid: r.rid, name: r.name, pos: r.dp || r.p, basePos: r.p, ovr: r.dovr || r.o, baseOvr: r.o, age: r.a,
      value: r.v, salary: r.w, club: r.c, nat: r.nt, goals: r.goals, assists: r.assists, band: r.dband || null,
    }));
}

async function autoLineup(leagueId, memberId, formation) {
  const slots = FORMS[formation] || FORMS['4-3-3'];
  const squad = ownedPlayers(leagueId, memberId).sort(async (a, b) => b.ovr - a.ovr);
  const used = new Set();
  const out = slots.map(async ([pos]) => {
    const p = squad.find(async x => x.pos === pos && !used.has(x.id));
    if (p) { used.add(p.id); return p.id; }
    return null;
  });
  return out.map(async id => {
    if (id) return id;
    const p = squad.find(async x => !used.has(x.id));
    if (p) { used.add(p.id); return p.id; }
    return null;
  });
}

async function squadAvg(players) {
  if (!players.length) return 0;
  return Math.round(players.reduce(async (a, p) => a + p.ovr, 0) / players.length);
}

async function teamStrength(leagueId, memberId, formation) {
  const slots = await getLineup(memberId, formation).filter(Boolean);
  if (!slots.length) return 60;
  const players = slots.map(async id => (await one('SELECT COALESCE(cp.draft_ovr,b.ovr) AS ovr FROM club_players cp JOIN players_base b ON b.id=cp.base_id WHERE cp.id=?', id))).filter(Boolean);
  if (!players.length) return 60;
  return players.reduce(async (a, p) => a + p.ovr, 0) / players.length;
}

async function simulateMatch(leagueId, homeId, awayId, competition, round, rnd = Math.random, fixtureId = null) {
  const lh = await one('SELECT formation FROM leagues WHERE id=?', leagueId);
  const mh = await one('SELECT formation FROM members WHERE id=?', homeId);
  const ma = await one('SELECT formation FROM members WHERE id=?', awayId);
  const fh = (mh && mh.formation) || (lh && lh.formation) || '4-3-3';
  const fa = (ma && ma.formation) || (lh && lh.formation) || '4-3-3';
  const sh = teamStrength(leagueId, homeId, fh) + (rnd() - 0.5) * 12 + 2.5;
  const sa = teamStrength(leagueId, awayId, fa) + (rnd() - 0.5) * 12;
  const λh = Math.max(0.15, (sh - 55) / 9), λa = Math.max(0.15, (sa - 55) / 9);
  const poisson = λ => {
    const L = Math.exp(-λ); let k = 0, p = 1;
    do { k++; p *= rnd(); } while (p > L && k < 12);
    return k - 1;
  };
  const hs = Math.min(9, poisson(λh)), as = Math.min(9, poisson(λa));
  let info;
  if (fixtureId) {
    info = await run('UPDATE fixtures SET home_score=?,away_score=?,status="jogado",played_at=? WHERE id=?', hs, as, Date.now(), fixtureId);
  } else {
    info = await run('INSERT INTO fixtures(league_id,competition,round,home_id,away_id,home_score,away_score,status,played_at) VALUES (?,?,?,?,?,?,?,"jogado",?)',
      leagueId, competition, round, homeId, awayId, hs, as, Date.now());
  }
  const fid = fixtureId || Number(info.lastInsertRowid);
  if (competition === 'league') {
    const up = async (id, gf, ga) => {
      const r = await one('SELECT * FROM standings WHERE league_id=? AND member_id=?', leagueId, id);
      if (!r) return;
      const w = r.w + (gf > ga ? 1 : 0), d = r.d + (gf === ga ? 1 : 0), l = r.l + (gf < ga ? 1 : 0);
      await run('UPDATE standings SET w=?,d=?,l=?,gf=?,ga=? WHERE league_id=? AND member_id=?', w, d, l, r.gf + gf, r.ga + ga, leagueId, id);
    };
    up(homeId, hs, as); up(awayId, as, hs);
  }
  const players = await all(`SELECT cp.id,cp.member_id,b.name FROM club_players cp JOIN players_base b ON b.id=cp.base_id
    WHERE cp.league_id=? AND cp.member_id IN (?,?) AND cp.status="own"`, leagueId, homeId, awayId);
  const of = tid => players.filter(async p => p.member_id === tid);
  const pick = a => a[Math.floor(rnd() * a.length)];
  const events = { goals: [], cards: [], injuries: [] };
  for (let i = 0; i < hs + as; i++) {
    const tid = i < hs ? homeId : awayId, a = of(tid);
    if (!a.length) continue;
    const scorer = pick(a), others = a.filter(async p => p.id !== scorer.id);
    const assist = rnd() < 0.65 && others.length ? pick(others) : null;
    events.goals.push({ pid: scorer.id, name: scorer.name, minute: 1 + Math.floor(rnd() * 90), assistPid: assist ? assist.id : null, assistName: assist ? assist.name : '' });
    await run('UPDATE club_players SET goals=goals+1 WHERE id=?', scorer.id);
    if (assist) await run('UPDATE club_players SET assists=assists+1 WHERE id=?', assist.id);
  }
  for (const tid of [homeId, awayId]) {
    const a = of(tid);
    if (!a.length) return;
    const qtd = rnd() < 0.55 ? 1 + Math.floor(rnd() * 2) : 0;
    for (let i = 0; i < qtd; i++) {
      const p = pick(a);
      events.cards.push({ pid: p.id, name: p.name, minute: 1 + Math.floor(rnd() * 90), type: rnd() < 0.85 ? 'amarelo' : 'vermelho' });
    }
    if (rnd() < 0.22) {
      const p = pick(a);
      events.injuries.push({ pid: p.id, name: p.name, minute: 1 + Math.floor(rnd() * 90) });
    }
  }
  await run(`INSERT INTO match_reports(fixture_id,league_id,events,updated_at) VALUES (?,?,?,?)
    ON CONFLICT(fixture_id) DO UPDATE SET events=excluded.events,updated_at=excluded.updated_at`,
    fid, leagueId, JSON.stringify(events), Date.now());
  return { home: hs, away: as, fixtureId: fid, events };
}

async function standings(leagueId) {
  return (await all('SELECT s.*,m.team,m.slot,m.coach FROM standings s JOIN members m ON m.id=s.member_id WHERE s.league_id=?', leagueId))
    .map(r => ({
      member_id: r.member_id, slot: r.slot, id: r.slot, name: r.team, team: r.team, coach: r.coach || '',
      w: r.w, d: r.d, l: r.l, gf: r.gf, ga: r.ga,
      played: r.w + r.d + r.l, gd: r.gf - r.ga, pts: r.w * 3 + r.d,
    }))
    .sort((a, b) => b.pts - a.pts || b.w - a.w || b.gd - a.gd || b.gf - a.gf || String(a.name || a.team || '').localeCompare(String(b.name || b.team || '')));
}

function requireInt(v, name, min = 0) {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n) || n < min) throw new Error('Valor inválido para ' + name);
  return n;
}

module.exports = {
  GAMES, FORMS, MINQ, DRAFT_POS, DRAFT_STARTER_POS, DRAFT_BANDS, rngFrom, norm, roundK, shuffle, pb, loadBase,
  rollDraftOverall, draftPickCount, draftAllowedPos, formSlots,
  teamAt, getLineup, saveLineup, ownedPlayers, autoLineup, squadAvg, teamStrength,
  simulateMatch, standings, requireInt,
};
