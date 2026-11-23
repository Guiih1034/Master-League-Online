const fs = require('node:fs');
const path = require('node:path');
const { init, run, one, all, execRaw, tx, IS_PG } = require('./db');
const { norm } = require('./util');

const FILE = process.env.PLAYERS_FILE || path.join(__dirname, '..', 'FC26_20250921.csv');
const GAME = process.env.SEED_GAME || 'fc26';

function parseCSV(text) {
  const rows = [];
  let i = 0, field = '', row = [], inQ = false;
  while (i < text.length) {
    const c = text[i];
    if (inQ) {
      if (c === '"') { if (text[i+1] === '"') { field += '"'; i += 2; continue; } inQ = false; i++; continue; }
      field += c; i++; continue;
    }
    if (c === '"') { inQ = true; i++; continue; }
    if (c === ',') { row.push(field); field = ''; i++; continue; }
    if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i+1] === '\n') i++;
      row.push(field); field = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = []; i++; continue;
    }
    field += c; i++;
  }
  row.push(field);
  if (row.length > 1 || row[0] !== '') rows.push(row);
  return rows;
}

function idx(header) { const m = {}; header.forEach((h, i) => m[h.trim()] = i); return m; }
function val(row, m, k) { const i = m[k]; return i == null ? '' : (row[i] ?? ''); }
function num(row, m, k) { const n = Number(val(row, m, k)); return Number.isFinite(n) ? n : 0; }

const POS_MAP = {
  GK:'GOL', CB:'ZAG', RB:'LD', RWB:'LD', LB:'LE', LWB:'LE',
  CDM:'VOL', CM:'MC', CAM:'MEI', RM:'PD', RW:'PD', RF:'PD',
  LM:'PE', LW:'PE', LF:'PE', CF:'ATA', ST:'ATA'
};
function mapPos(raw) {
  const first = String(raw||'').split(',')[0].trim().toUpperCase();
  return POS_MAP[first] || 'MC';
}
async function loadPlayers() {
  if (!fs.existsSync(FILE)) throw new Error('Arquivo nǜo encontrado: ' + FILE);
  if (FILE.toLowerCase().endsWith('.json')) {
    const arr = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    if (!Array.isArray(arr)) throw new Error('JSON invǭlido');
    return arr.map(p => ({
      id: Number(p.i)||0, rid: Number(p.i)||null, name: String(p.n||'').slice(0,80),
      pos: mapPos(p.p), ps: String(p.ps||p.p||'').slice(0,20),
      ovr: Number(p.o)||0, pot: Number(p.t)||Number(p.o)||0, age: Number(p.a)||0,
      value: Number(p.v)||0, wage: Number(p.w)||0, club: String(p.c||'').slice(0,60),
      nat: String(p.nt||'').slice(0,40), liga: String(p.l||'').slice(0,60), faceUrl: '',
    }));
  }
  const text = fs.readFileSync(FILE, 'utf8');
  const rows = parseCSV(text);
  const m = idx(rows[0]);
  return rows.slice(1).filter(r => r.length > 1).map(r => {
    const id = num(r, m, 'player_id');
    const name = String(val(r, m, 'short_name') || val(r, m, 'long_name') || '').slice(0,80);
    const posRaw = String(val(r, m, 'player_positions') || '').trim();
    return {
      id, rid: id || null, name,
      pos: mapPos(posRaw), ps: posRaw.slice(0,20),
      ovr: num(r, m, 'overall'), pot: num(r, m, 'potential'), age: num(r, m, 'age'),
      value: num(r, m, 'value_eur'), wage: num(r, m, 'wage_eur'),
      club: String(val(r, m, 'club_name') || '').slice(0,60),
      nat: String(val(r, m, 'nationality_name') || '').slice(0,40),
      liga: String(val(r, m, 'league_name') || '').slice(0,60),
      faceUrl: String(val(r, m, 'player_face_url') || '').slice(0,255),
    };
  }).filter(p => p.id && p.name);
}

async function clearLeagueData() {
  const tables = ['notifications','tx','match_reports','fixtures','standings','offers','bids','auctions','loans','sponsor_deals','lineups','draft_picks','brand_bids','club_players','members','leagues','sessions'];
  for (const t of tables) {
    try { await execRaw('DELETE FROM ' + t); } catch(e) { /* table may not exist yet */ }
  }
}

async function main() {
  await init();
  const players = await loadPlayers();
  if (!players.length) throw new Error('Nenhum jogador carregado de ' + FILE);
  await clearLeagueData();
  if(IS_PG) await execRaw('BEGIN'); else await execRaw('BEGIN IMMEDIATE');
  try {
    await run('DELETE FROM players_base WHERE game=?', GAME);
    await run('DELETE FROM clubs WHERE game=?', GAME);
    const INS=`INSERT INTO players_base(id,game,rid,name,pos,ps,ovr,pot,age,value,wage,club,nat,liga,nkey,face_url)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(id) DO UPDATE SET game=excluded.game,rid=excluded.rid,name=excluded.name,pos=excluded.pos,
      ps=excluded.ps,ovr=excluded.ovr,pot=excluded.pot,age=excluded.age,value=excluded.value,
      wage=excluded.wage,club=excluded.club,nat=excluded.nat,liga=excluded.liga,nkey=excluded.nkey,face_url=excluded.face_url`;
    for (const p of players) {
      const args=[p.id, GAME, p.rid, p.name, p.pos, p.ps, p.ovr, p.pot, p.age, p.value, p.wage, p.club, p.nat, p.liga, norm(p.name + ' ' + p.club + ' ' + p.nat), p.faceUrl || ''];
      
      await run(INS, ...args);
    }
    await execRaw('COMMIT');
  } catch (e) { await execRaw('ROLLBACK'); throw e; }
  const n = (await one('SELECT count(*) AS n FROM players_base WHERE game=?', GAME)).n;
  const clubs = await require('./clubs').seedClubs(GAME);
  console.log(`Base ${GAME} importada: ${n} jogadores, ${clubs} clubes. Dados de ligas limpos.`);
}

if (require.main === module) {
  main().catch(e => { console.error(e); process.exitCode = 1; });
}

module.exports = { main };
