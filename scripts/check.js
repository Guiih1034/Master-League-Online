const { spawn, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'liga-check-'));
const DB_PATH = path.join(tmp, 'test.db');
const PORT = 31000 + Math.floor(Math.random() * 1000);
const base = `http://127.0.0.1:${PORT}/api`;

// clear pg env for local check
process.env.DATABASE_URL=''; delete process.env.SUPABASE_DB_URL; process.env.DB_JOURNAL_MODE='DELETE';
const seed = spawnSync(process.execPath, ['server/seed.js'], {
  cwd: path.join(__dirname, '..'), env: { ...process.env, DB_PATH, DATABASE_URL:'', SUPABASE_DB_URL:'', DB_JOURNAL_MODE:'DELETE' }, encoding: 'utf8',
});
if (seed.status !== 0) { console.error(seed.stdout, seed.stderr); process.exit(1); }

const child = spawn(process.execPath, ['server/index.js'], {
  cwd: path.join(__dirname, '..'), env: { ...process.env, DB_PATH, DATABASE_URL:'', SUPABASE_DB_URL:'', DB_JOURNAL_MODE:'DELETE', PORT: String(PORT) }, stdio: ['ignore', 'pipe', 'pipe'],
});
let logs = '';
child.stdout.on('data', d => { logs += d; });
child.stderr.on('data', d => { logs += d; });

const wait = ms => new Promise(r => setTimeout(r, ms));
async function reg(email, password, name){
  let r;
  try { r = await call('POST','/auth/register',{email,password,name}); } catch(e){ r = {error:String(e.message||e)}; }
  // read token from fresh connection to see server's writes
  const { DatabaseSync } = require('node:sqlite');
  let tdb = new DatabaseSync(DB_PATH, { readOnly: true });
  let u = tdb.prepare('SELECT verify_token,email_verified FROM users WHERE email=?').get(email);
  tdb.close();
  if (u?.verify_token) {
    await fetch(base + '/auth/verify?token=' + encodeURIComponent(u.verify_token), {redirect:'manual'});
    await wait(200);
  } else if (!u?.email_verified) {
    // force verify via direct DB + checkpoint
    tdb = new DatabaseSync(DB_PATH);
    tdb.prepare('UPDATE users SET email_verified=1,verify_token=NULL,verify_expires=NULL WHERE email=?').run(email);
    tdb.exec('PRAGMA wal_checkpoint(TRUNCATE)');
    tdb.close();
    await wait(300);
  }
  let l;
  try { l = await call('POST','/auth/login',{email,password}); } catch(e){ l={error:String(e.message||e)}; }
  if(l.token) return l.token;
  if(l.needsVerify || /Confirme/.test(l.error||'')){
    const { DatabaseSync } = require('node:sqlite');
    const tdb=new DatabaseSync(DB_PATH);
    tdb.prepare('UPDATE users SET email_verified=1,verify_token=NULL,verify_expires=NULL WHERE email=?').run(email);
    tdb.exec('PRAGMA wal_checkpoint(PASSIVE)');
    tdb.close();
    await wait(500);
    try { l = await call('POST','/auth/login',{email,password}); } catch(e){ l={error:String(e.message||e)}; }
  }
  if(l.error) throw new Error(l.error);
  return l.token;
}

async function ready() {
  for (let i = 0; i < 80; i++) {
    try { const r = await fetch(base + '/health'); if (r.ok) return; } catch {}
    await wait(200);
  }
  throw new Error('servidor não subiu:\n' + logs);
}

let token = '';
async function call(method, url, body, expectFail = false) {
  const r = await fetch(base + url, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const j = await r.json().catch(() => ({}));
  if (expectFail) {
    if (r.ok) throw new Error(`${method} ${url}: esperava falha mas ok`);
    return j;
  }
  if (!r.ok) throw new Error(`${method} ${url}: ${r.status} ${j.error || ''}`);
  return j;
}

(async () => {
  await ready();
  const now = Date.now();

  // --- Usuário 1 cria liga (humano-only) ---
  const u1 = 'u1' + now + '@teste.com';
  const reg1 = await call('POST', '/auth/register', { email: u1, password: '123456', name: 'Tecnico 1' });
  token = await reg(u1,'123456','Tecnico 1'); // fixed
  const created = await call('POST', '/leagues', { name: 'Liga Humana', game: 'fc26', startMode: 'random', rounds: 15, team: 'Time A', coach: 'Tecnico 1', phone: '5511999990001' });
  const id = created.id;
  const st = () => call('GET', `/leagues/${id}`);
  let s = (await st()).state;

  if (s.league.phase !== 'brand') throw new Error('liga não iniciou em escolha de clubes');
  if ((s.teams || []).filter(t=>t.isAi||t.slot>=1).length !== 0) throw new Error('liga criada com bots/times extras');
  if (s.me.phone !== '5511999990001') throw new Error('telefone do criador não salvo');

  // dono pode fechar com 1 técnico (sem bots; adversários entram depois)
  await call('POST', `/leagues/${id}/brands/bid`, { clubId: s.brands.options[0].id });

  // --- Usuário 2 entra ---
  const u2 = 'u2' + now + '@teste.com';
  const reg2 = await call('POST', '/auth/register', { email: u2, password: '123456', name: 'Tecnico 2' });
  const token1 = token;
  token = (await call('POST','/auth/login',{email:u2,password:'123456'})).token;
  const joined = await call('POST', '/leagues/join', { invite: created.invite, team: 'Time B', coach: 'Tecnico 2', phone: '5511999990002' });
  if (joined.id !== id) throw new Error('convite falhou');
  let s2 = joined.state;
  if (!s2.squad || s2.squad.length) { /* brand phase: sem elenco ainda, ok */ }
  if (s2.me.slot === s.me.slot) throw new Error('slots duplicados');

  // user2 escolhe clube diferente
  const opt2 = (s2.brands.options || []).find(c => !c.taken);
  if (!opt2) throw new Error('sem clube disponível para segundo técnico');
  await call('POST', `/leagues/${id}/brands/bid`, { clubId: opt2.id });

  // --- Dono fecha e inicia temporada ---
  token = token1;
  s = (await st()).state;
  await call('POST', `/leagues/${id}/brands/close`);
  s = (await st()).state;
  if (s.league.phase !== 'season') throw new Error('temporada não iniciou após clubes: ' + s.league.phase);
  if (!s.me.club) throw new Error('clube não atribuído ao dono');
  if ((s.teams || []).length !== 1) throw new Error('esperava 1 adversário humano, veio: ' + (s.teams || []).length);
  if ((s.table || []).length !== 2) throw new Error('classificação deveria ter 2 times');
  if (s.table.some(r => (r.w||0)+(r.d||0)+(r.l||0) > 0)) throw new Error('classificação iniciada com jogos');
  if ((s.offers || []).length) throw new Error('liga criada com propostas');
  if ((s.teams || []).some(t => t.isAI)) throw new Error('ainda há time IA');

  const leagueFx = (s.fixtures || []).filter(f => f.competition === 'league');
  if (leagueFx.length !== 2) throw new Error('calendário ida/volta para 2 times deveria ter 2 jogos, veio: ' + leagueFx.length);
  if (!leagueFx.some(f => f.leg === 1) || !leagueFx.some(f => f.leg === 2)) throw new Error('turno/returno não gerado');
  if (leagueFx.some(f => f.status !== 'pendente')) throw new Error('jogos deveriam iniciar pendentes');
  const pairs = new Set(leagueFx.map(f => [f.homeSlot, f.awaySlot].sort((a,b)=>a-b).join('-')));
  if (leagueFx.length !== pairs.size * 2) throw new Error('cada confronto deve ocorrer ida e volta');
  const fx0 = leagueFx[0];
  if (!fx0.homePhone || !fx0.awayPhone) throw new Error('telefones dos adversários não expostos nas partidas');

  // geração duplicada negada
  const dup = await call('POST', `/leagues/${id}/fixtures/generate`, {}, true);
  if (!/gerad/i.test(dup.error || '')) throw new Error('calendário duplicado deveria ser negado');

  // patrocínio
  await call('POST', `/leagues/${id}/sponsors`, { sponsorId: 'adidas' });
  s = (await st()).state;
  if (!(s.sponsors && s.sponsors.deals && s.sponsors.deals.length)) throw new Error('patrocínio não firmado');

  // elenco/escalação
  await call('POST', `/leagues/${id}/formation`, { formation: '4-4-2' });
  const auto = await call('POST', `/leagues/${id}/lineup/auto`);
  if (!(auto.state.lineup || []).filter(Boolean).length) throw new Error('escalação automática falhou');

  // perfil/telefone atualizável
  await call('POST', `/leagues/${id}/profile`, { phone: '5511888877771', coach: 'Tecnico 1B' });
  s = (await st()).state;
  if (s.me.phone !== '5511888877771') throw new Error('perfil/telefone não atualizou');

  // endpoints de simulação automática removidos
  const playFail = await call('POST', `/leagues/${id}/fixtures/${fx0.id}/play`, {}, true);
  if (!playFail.error) throw new Error('endpoint de simular partida deveria estar indisponível');
  const roundFail = await call('POST', `/leagues/${id}/rounds/play`, {}, true);
  if (!roundFail.error) throw new Error('endpoint de simular rodada deveria estar indisponível');

  // registrar resultado manual (marcaram fora do app e salvaram)
  await call('POST', `/leagues/${id}/fixtures/${fx0.id}/report`, {
    homeScore: 2, awayScore: 1,
    events: { goals: [{ name: 'Artilheiro', minute: 10, assistName: 'Garçom' }], cards: [], injuries: [] },
    photo: 'data:image/png;base64,iVBORw0KGgo=',
    note: 'Jogo combinado no WhatsApp'
  });
  s = (await st()).state;
  const playedFx = s.fixtures.find(f => f.id === fx0.id);
  if (!playedFx || playedFx.status !== 'jogado' || playedFx.hs !== 2 || playedFx.as !== 1) throw new Error('resultado manual não registrado');
  if (!playedFx.report || playedFx.report.note !== 'Jogo combinado no WhatsApp' || !playedFx.report.events.goals.length) throw new Error('ficha da partida não salva');
  const playedRows = s.table.filter(r => (r.w||0)+(r.d||0)+(r.l||0) > 0);
  if (playedRows.length !== 2) throw new Error('classificação não atualizou com resultado manual');

  // --- Proposta entre humanos ---
  token = token1;
  s = (await st()).state;
  const human = (s.teams || [])[0];
  if (!human) throw new Error('adversário humano não encontrado');
  const want = [...(human.squad || [])].sort((a,b)=>a.value-b.value)[0];
  if (!want) throw new Error('adversário sem elenco para proposta');
  await call('POST', `/leagues/${id}/offers`, { toSlot: human.id, playerId: want.id, kind: 'transfer', amount: Math.min(Math.round(want.value * 1.1), s.me.balance - 1) });
  token = reg2.token;
  s2 = (await st()).state;
  const incoming = (s2.offers || []).find(o => o.dir === 'in' && o.status === 'pendente');
  if (!incoming) throw new Error('proposta humana não chegou');
  await call('POST', `/leagues/${id}/offers/${incoming.id}/respond`, { accept: true });
  s2 = (await st()).state;
  if ((s2.offers || []).find(o => o.id === incoming.id)?.status !== 'aceita') throw new Error('proposta humana não foi aceita');

  // --- Amistoso: convite -> aceite (sem auto-simulação) -> registrar resultado ---
  token = token1;
  await call('POST', `/leagues/${id}/friendlies`, { toSlot: human.id });
  token = reg2.token;
  s2 = (await st()).state;
  const fri = (s2.fixtures || []).find(f => f.competition === 'friendly' && f.status === 'pendente');
  if (!fri) throw new Error('convite de amistoso não chegou');
  await call('POST', `/leagues/${id}/friendlies/${fri.id}/respond`, { accept: true });
  s2 = (await st()).state;
  const friAcc = (s2.fixtures || []).find(f => f.id === fri.id);
  if (!friAcc || (friAcc.status !== 'aceito' && friAcc.status !== 'pendente')) {
    // aceitar muda para 'aceito'
  }
  if (!friAcc || friAcc.status !== 'aceito') throw new Error('amistoso não ficou como aceito para marcar jogo');
  await call('POST', `/leagues/${id}/fixtures/${fri.id}/report`, { homeScore: 1, awayScore: 1, events: { goals: [], cards: [], injuries: [] }, note: 'Amistoso' });
  s2 = (await st()).state;
  const friDone = (s2.fixtures || []).find(f => f.id === fri.id);
  if (!friDone || friDone.status !== 'jogado') throw new Error('resultado do amistoso não registrado');

  // --- Permissão de exclusão ---
  let denied = false;
  try { await call('DELETE', `/leagues/${id}`); } catch (e) { denied = /dono/i.test(e.message); }
  if (!denied) throw new Error('usuário não-dono conseguiu excluir a liga');

  // --- Draft com 2 humanos ---
  token = token1;
  const d = await call('POST', '/leagues', { name: 'Draft Humano', game: 'fc26', startMode: 'draft', rounds: 15, team: 'Draft A', coach: 'D1', phone: '551100000001' });
  const d2reg = await call('POST', '/auth/register', { email: 'd2' + now + '@teste.com', password: '123456', name: 'D2' });
  const tokenD1 = token1;
  const tokenD2 = d2reg.token;
  token = tokenD2;
  await call('POST', '/leagues/join', { invite: d.invite, team: 'Draft B', coach: 'D2', phone: '551100000002' });

  // ambos escolhem clubes
  token = tokenD1;
  let ds = (await call('GET', `/leagues/${d.id}`)).state;
  await call('POST', `/leagues/${d.id}/brands/bid`, { clubId: ds.brands.options[0].id });
  token = tokenD2;
  ds = (await call('GET', `/leagues/${d.id}`)).state;
  const dopt2 = ds.brands.options.find(c => !c.taken);
  await call('POST', `/leagues/${d.id}/brands/bid`, { clubId: dopt2.id });
  token = tokenD1;
  await call('POST', `/leagues/${d.id}/brands/close`);

  // completar draft com escolhas automáticas por turno (humano, sem simulação global de bots)
  let guard = 0;
  while (guard++ < 400) {
    token = tokenD1; ds = (await call('GET', `/leagues/${d.id}`)).state;
    if (ds.league.phase === 'season') break;
    if (ds.draft && ds.draft.myTurn) { await call('POST', `/leagues/${d.id}/draft/auto`); continue; }
    token = tokenD2; ds = (await call('GET', `/leagues/${d.id}`)).state;
    if (ds.league.phase === 'season') break;
    if (ds.draft && ds.draft.myTurn) { await call('POST', `/leagues/${d.id}/draft/auto`); continue; }
    throw new Error('draft travou: pick=' + (ds.draft && ds.draft.k) + ' total=' + (ds.draft && ds.draft.total));
  }
  token = tokenD1;
  ds = (await call('GET', `/leagues/${d.id}`)).state;
  if (ds.league.phase !== 'season') throw new Error('draft não concluiu: ' + ds.league.phase);
  if ((ds.squad || []).length < 15) throw new Error('draft não montou elenco completo');
  if ((ds.squad || []).filter(p => p.pos === 'GOL').length < 2) throw new Error('draft sem goleiro reserva');
  if ((ds.teams || []).some(t => t.isAI)) throw new Error('draft gerou time IA');

  // dono exclui liga do draft
  await call('DELETE', `/leagues/${d.id}`);

  console.log('OK: auth, liga humana sem bots, escolha de clubes, calendário ida/volta, telefones/WhatsApp (dados), resultado manual, propostas, amistoso, perfil, draft e permissões.');
})().catch(e => { console.error('FALHA:', e.message, '\n' + logs); process.exitCode = 1; }).finally(() => {
  child.kill();
  setTimeout(() => fs.rmSync(tmp, { recursive: true, force: true }), 400);
});
