const path = require('node:path');
const fs = require('node:fs');

const DATABASE_URL = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL || '';
const IS_PG = /^postgres(ql)?:\/\//i.test(DATABASE_URL);

let db, pgPool;
const DB_PATH = process.env.DB_PATH || (process.env.VERCEL ? path.join('/tmp', 'liga.db') : path.join(__dirname, '..', 'data', 'liga.db'));

if (IS_PG) {
  const { Pool } = require('pg');
  pgPool = new Pool({ connectionString: DATABASE_URL, ssl: process.env.PGSSL === '0' ? false : { rejectUnauthorized: false } });
} else {
  const { DatabaseSync } = require('node:sqlite');
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  db = new DatabaseSync(DB_PATH);
  db.exec(`PRAGMA journal_mode=${process.env.DB_JOURNAL_MODE||'WAL'}; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;`);
}

function convertSql(sql) {
  if (!IS_PG) return sql.replace(/"([^"]*)"/g, "'$1'");
  let i = 0;
  let out = sql.replace(/"([^"]*)"/g, "'$1'");
  out = out.replace(/\?/g, () => '$' + (++i));
  out = out.replace(/INTEGER PRIMARY KEY AUTOINCREMENT/gi, 'SERIAL PRIMARY KEY');
  out = out.replace(/AUTOINCREMENT/gi, '');
  out = out.replace(/COLLATE NOCASE/gi, '');
  out = out.replace(/INSERT OR IGNORE/gi, 'INSERT');
  return out;
}
function isInsertIgnore(sql) { return /INSERT\s+OR\s+IGNORE/i.test(sql); }

async function all(sql, ...args) {
  const s = convertSql(sql);
  if (IS_PG) {
    const r = await pgPool.query(s, args);
    return r.rows.map(row => ({ ...row }));
  }
  return db.prepare(s).all(...args).map(r => ({ ...r }));
}
async function one(sql, ...args) {
  const rows = await all(sql, ...args);
  return rows[0] ? { ...rows[0] } : null;
}
async function run(sql, ...args) {
  let s = convertSql(sql);
  if (IS_PG) {
    const ignore = isInsertIgnore(sql);
    if (ignore && !/ON CONFLICT/i.test(s)) s += ' ON CONFLICT DO NOTHING';
    const isInsert = /^\s*INSERT\b/i.test(sql);
    if (isInsert && !/RETURNING\b/i.test(s)) s += ' RETURNING id';
    try {
      const r = await pgPool.query(s, args);
      const id = r.rows[0]?.id;
      return { lastInsertRowid: id ?? null, changes: r.rowCount ?? 0, rows: r.rows };
    } catch (e) {
      if (ignore) return { lastInsertRowid: null, changes: 0, rows: [] };
      throw e;
    }
  }
  const info = db.prepare(s).run(...args);
  return { lastInsertRowid: info.lastInsertRowid, changes: info.changes };
}

let txClient = null;
async function tx(fn) {
  if (IS_PG) {
    const client = await pgPool.connect();
    const prev = txClient;
    txClient = client;
    try {
      await client.query('BEGIN');
      const out = await fn();
      await client.query('COMMIT');
      return out;
    } catch (e) {
      try { await client.query('ROLLBACK'); } catch {}
      throw e;
    } finally {
      txClient = prev;
      client.release();
    }
  }
  db.exec('BEGIN IMMEDIATE');
  try { const out = await fn(); db.exec('COMMIT'); return out; }
  catch (e) { try { db.exec('ROLLBACK'); } catch {} throw e; }
}

// Route queries through tx client on PG
async function qall(sql, ...args) {
  const s = convertSql(sql);
  if (IS_PG) {
    const c = txClient || pgPool;
    const ignore = isInsertIgnore(sql);
    let sq = s;
    if (ignore && !/ON CONFLICT/i.test(sq)) sq += ' ON CONFLICT DO NOTHING';
    const r = await c.query(sq, args);
    return r.rows.map(row => ({ ...row }));
  }
  return db.prepare(s).all(...args).map(r => ({ ...r }));
}
async function qone(sql, ...args) { const rows = await qall(sql, ...args); return rows[0] ? { ...rows[0] } : null; }
async function qrun(sql, ...args) {
  let s = convertSql(sql);
  if (IS_PG) {
    const c = txClient || pgPool;
    const ignore = isInsertIgnore(sql);
    if (ignore && !/ON CONFLICT/i.test(s)) s += ' ON CONFLICT DO NOTHING';
    const isInsert = /^\s*INSERT\b/i.test(sql);
    if (isInsert && !/RETURNING\b/i.test(s)) s += ' RETURNING id';
    try { const r = await c.query(s, args); return { lastInsertRowid: r.rows[0]?.id ?? null, changes: r.rowCount ?? 0, rows: r.rows }; }
    catch (e) { if (ignore) return { lastInsertRowid: null, changes: 0, rows: [] }; throw e; }
  }
  const info = db.prepare(s).run(...args);
  return { lastInsertRowid: info.lastInsertRowid, changes: info.changes };
}

async function execRaw(sql) {
  if (IS_PG) { await (txClient || pgPool).query(sql); return; }
  db.exec(sql);
}

async function init() {
  const schema = `
    CREATE TABLE IF NOT EXISTS users(
      id ${IS_PG ? 'SERIAL PRIMARY KEY' : 'INTEGER PRIMARY KEY AUTOINCREMENT'},
      email TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      pass TEXT NOT NULL,
      created_at BIGINT NOT NULL,
      email_verified INTEGER NOT NULL DEFAULT 0,
      verify_token TEXT,
      verify_expires BIGINT
    );
    CREATE TABLE IF NOT EXISTS sessions(
      token TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at BIGINT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS leagues(
      id ${IS_PG ? 'SERIAL PRIMARY KEY' : 'INTEGER PRIMARY KEY AUTOINCREMENT'},
      name TEXT NOT NULL,
      game TEXT NOT NULL,
      owner_id INTEGER NOT NULL REFERENCES users(id),
      invite TEXT NOT NULL UNIQUE,
      start_mode TEXT NOT NULL DEFAULT 'draft',
      rounds INTEGER NOT NULL DEFAULT 15,
      formation TEXT NOT NULL DEFAULT '4-3-3',
      phase TEXT NOT NULL DEFAULT 'draft',
      season INTEGER NOT NULL DEFAULT 1,
      round INTEGER NOT NULL DEFAULT 0,
      draft_order TEXT,
      pick_index INTEGER NOT NULL DEFAULT 0,
      cup_stage INTEGER NOT NULL DEFAULT 0,
      draft_options TEXT,
      market_open INTEGER NOT NULL DEFAULT 1,
      created_at BIGINT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS members(
      id ${IS_PG ? 'SERIAL PRIMARY KEY' : 'INTEGER PRIMARY KEY AUTOINCREMENT'},
      league_id INTEGER NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      slot INTEGER NOT NULL,
      team TEXT NOT NULL,
      coach TEXT NOT NULL,
      game_id TEXT NOT NULL DEFAULT '',
      balance BIGINT NOT NULL DEFAULT 50000000,
      formation TEXT NOT NULL DEFAULT '4-3-3',
      is_ai INTEGER NOT NULL DEFAULT 0,
      club_id INTEGER,
      brand_budget BIGINT NOT NULL DEFAULT 25000000,
      phone TEXT NOT NULL DEFAULT '',
      joined_at BIGINT NOT NULL,
      UNIQUE(league_id, slot)
    );
    CREATE TABLE IF NOT EXISTS players_base(
      id INTEGER PRIMARY KEY,
      game TEXT NOT NULL,
      rid INTEGER,
      name TEXT NOT NULL,
      pos TEXT NOT NULL,
      ps TEXT NOT NULL,
      ovr INTEGER NOT NULL,
      pot INTEGER NOT NULL,
      age INTEGER NOT NULL,
      value BIGINT NOT NULL,
      wage BIGINT NOT NULL,
      club TEXT NOT NULL,
      nat TEXT NOT NULL,
      liga TEXT NOT NULL,
      nkey TEXT NOT NULL,
      face_url TEXT NOT NULL DEFAULT ''
    );
    CREATE INDEX IF NOT EXISTS idx_base_game ON players_base(game);
    CREATE INDEX IF NOT EXISTS idx_base_key ON players_base(nkey);
    CREATE TABLE IF NOT EXISTS clubs(
      id INTEGER PRIMARY KEY,
      game TEXT NOT NULL,
      name TEXT NOT NULL,
      short TEXT NOT NULL,
      country TEXT NOT NULL,
      color1 TEXT NOT NULL,
      color2 TEXT NOT NULL,
      price BIGINT NOT NULL,
      strength INTEGER NOT NULL,
      crest_url TEXT NOT NULL DEFAULT '',
      kit_url TEXT NOT NULL DEFAULT ''
    );
    CREATE INDEX IF NOT EXISTS idx_clubs_game ON clubs(game);
    CREATE TABLE IF NOT EXISTS club_players(
      id ${IS_PG ? 'SERIAL PRIMARY KEY' : 'INTEGER PRIMARY KEY AUTOINCREMENT'},
      league_id INTEGER NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
      member_id INTEGER REFERENCES members(id) ON DELETE SET NULL,
      base_id INTEGER NOT NULL REFERENCES players_base(id),
      goals INTEGER NOT NULL DEFAULT 0,
      assists INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'own',
      draft_pos TEXT,
      draft_ovr INTEGER,
      draft_band TEXT,
      UNIQUE(league_id, base_id)
    );
    CREATE INDEX IF NOT EXISTS idx_cp_member ON club_players(member_id);
    CREATE TABLE IF NOT EXISTS lineups(
      member_id INTEGER PRIMARY KEY REFERENCES members(id) ON DELETE CASCADE,
      slots TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS tx(
      id ${IS_PG ? 'SERIAL PRIMARY KEY' : 'INTEGER PRIMARY KEY AUTOINCREMENT'},
      league_id INTEGER NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
      member_id INTEGER REFERENCES members(id) ON DELETE SET NULL,
      note TEXT NOT NULL,
      amount BIGINT NOT NULL,
      created_at BIGINT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS offers(
      id ${IS_PG ? 'SERIAL PRIMARY KEY' : 'INTEGER PRIMARY KEY AUTOINCREMENT'},
      league_id INTEGER NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
      from_id INTEGER NOT NULL REFERENCES members(id),
      to_id INTEGER NOT NULL REFERENCES members(id),
      kind TEXT NOT NULL,
      player_id INTEGER NOT NULL REFERENCES club_players(id),
      swap_id INTEGER REFERENCES club_players(id),
      amount BIGINT NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'pendente',
      note TEXT,
      created_at BIGINT NOT NULL,
      resolved_at BIGINT
    );
    CREATE TABLE IF NOT EXISTS fixtures(
      id ${IS_PG ? 'SERIAL PRIMARY KEY' : 'INTEGER PRIMARY KEY AUTOINCREMENT'},
      league_id INTEGER NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
      competition TEXT NOT NULL,
      round INTEGER NOT NULL,
      leg INTEGER NOT NULL DEFAULT 1,
      home_id INTEGER REFERENCES members(id),
      away_id INTEGER REFERENCES members(id),
      home_score INTEGER,
      away_score INTEGER,
      status TEXT NOT NULL DEFAULT 'pendente',
      played_at BIGINT
    );
    CREATE TABLE IF NOT EXISTS standings(
      league_id INTEGER NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
      member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
      w INTEGER NOT NULL DEFAULT 0,
      d INTEGER NOT NULL DEFAULT 0,
      l INTEGER NOT NULL DEFAULT 0,
      gf INTEGER NOT NULL DEFAULT 0,
      ga INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY(league_id, member_id)
    );
    CREATE TABLE IF NOT EXISTS auctions(
      id ${IS_PG ? 'SERIAL PRIMARY KEY' : 'INTEGER PRIMARY KEY AUTOINCREMENT'},
      league_id INTEGER NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
      player_id INTEGER NOT NULL REFERENCES club_players(id),
      ends_at BIGINT NOT NULL,
      status TEXT NOT NULL DEFAULT 'aberta',
      winner_id INTEGER REFERENCES members(id),
      winner_amount BIGINT,
      created_at BIGINT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS bids(
      id ${IS_PG ? 'SERIAL PRIMARY KEY' : 'INTEGER PRIMARY KEY AUTOINCREMENT'},
      auction_id INTEGER NOT NULL REFERENCES auctions(id) ON DELETE CASCADE,
      member_id INTEGER NOT NULL REFERENCES members(id),
      amount BIGINT NOT NULL,
      created_at BIGINT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS loans(
      id ${IS_PG ? 'SERIAL PRIMARY KEY' : 'INTEGER PRIMARY KEY AUTOINCREMENT'},
      league_id INTEGER NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
      player_id INTEGER NOT NULL REFERENCES club_players(id),
      from_id INTEGER NOT NULL REFERENCES members(id),
      to_id INTEGER NOT NULL REFERENCES members(id),
      ends_round INTEGER NOT NULL,
      fee BIGINT NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'ativo'
    );
    CREATE TABLE IF NOT EXISTS notifications(
      id ${IS_PG ? 'SERIAL PRIMARY KEY' : 'INTEGER PRIMARY KEY AUTOINCREMENT'},
      member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
      text TEXT NOT NULL,
      read INTEGER NOT NULL DEFAULT 0,
      created_at BIGINT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS draft_picks(
      id ${IS_PG ? 'SERIAL PRIMARY KEY' : 'INTEGER PRIMARY KEY AUTOINCREMENT'},
      league_id INTEGER NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
      pick INTEGER NOT NULL,
      member_id INTEGER NOT NULL REFERENCES members(id),
      base_id INTEGER NOT NULL REFERENCES players_base(id),
      pos TEXT,
      ovr INTEGER,
      band TEXT,
      created_at BIGINT NOT NULL,
      UNIQUE(league_id, base_id)
    );
    CREATE TABLE IF NOT EXISTS brand_bids(
      id ${IS_PG ? 'SERIAL PRIMARY KEY' : 'INTEGER PRIMARY KEY AUTOINCREMENT'},
      league_id INTEGER NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
      club_id INTEGER NOT NULL REFERENCES clubs(id),
      member_id INTEGER NOT NULL REFERENCES members(id),
      amount BIGINT NOT NULL,
      created_at BIGINT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS match_reports(
      fixture_id INTEGER PRIMARY KEY REFERENCES fixtures(id) ON DELETE CASCADE,
      league_id INTEGER NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
      events TEXT NOT NULL,
      photo TEXT,
      note TEXT,
      updated_at BIGINT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sponsor_deals(
      id ${IS_PG ? 'SERIAL PRIMARY KEY' : 'INTEGER PRIMARY KEY AUTOINCREMENT'},
      league_id INTEGER NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
      member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
      sponsor_id INTEGER NOT NULL,
      goal_type TEXT NOT NULL,
      target INTEGER NOT NULL,
      reward BIGINT NOT NULL,
      progress INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'ativo',
      season INTEGER NOT NULL,
      created_at BIGINT NOT NULL
    );
  `;
  for (const stmt of schema.split(';').map(s => s.trim()).filter(Boolean)) {
    await execRaw(stmt);
  }
  // migrations for existing sqlite dbs
  if (!IS_PG) {
    const cols = db.prepare('PRAGMA table_info(members)').all().map(c => c.name);
    if (!cols.includes('club_id')) db.exec('ALTER TABLE members ADD COLUMN club_id INTEGER');
    if (!cols.includes('brand_budget')) db.exec('ALTER TABLE members ADD COLUMN brand_budget INTEGER NOT NULL DEFAULT 25000000');
    if (!cols.includes('phone')) db.exec("ALTER TABLE members ADD COLUMN phone TEXT NOT NULL DEFAULT ''");
    const fcols = db.prepare('PRAGMA table_info(fixtures)').all().map(c => c.name);
    if (!fcols.includes('leg')) db.exec('ALTER TABLE fixtures ADD COLUMN leg INTEGER NOT NULL DEFAULT 1');
    const lcols = db.prepare('PRAGMA table_info(leagues)').all().map(c => c.name);
    if (!lcols.includes('draft_options')) db.exec('ALTER TABLE leagues ADD COLUMN draft_options TEXT');
    if (!lcols.includes('market_open')) db.exec('ALTER TABLE leagues ADD COLUMN market_open INTEGER NOT NULL DEFAULT 1');
    const dcols = db.prepare('PRAGMA table_info(draft_picks)').all().map(c => c.name);
    if (!dcols.includes('pos')) db.exec('ALTER TABLE draft_picks ADD COLUMN pos TEXT');
    if (!dcols.includes('ovr')) db.exec('ALTER TABLE draft_picks ADD COLUMN ovr INTEGER');
    if (!dcols.includes('band')) db.exec('ALTER TABLE draft_picks ADD COLUMN band TEXT');
    const cpcols = db.prepare('PRAGMA table_info(club_players)').all().map(c => c.name);
    if (!cpcols.includes('draft_pos')) db.exec('ALTER TABLE club_players ADD COLUMN draft_pos TEXT');
    if (!cpcols.includes('draft_ovr')) db.exec('ALTER TABLE club_players ADD COLUMN draft_ovr INTEGER');
    if (!cpcols.includes('draft_band')) db.exec('ALTER TABLE club_players ADD COLUMN draft_band TEXT');
    const ccols = db.prepare('PRAGMA table_info(clubs)').all().map(c => c.name);
    if (!ccols.includes('crest_url')) db.exec("ALTER TABLE clubs ADD COLUMN crest_url TEXT NOT NULL DEFAULT ''");
    if (!ccols.includes('kit_url')) db.exec("ALTER TABLE clubs ADD COLUMN kit_url TEXT NOT NULL DEFAULT ''");
    const pcols = db.prepare('PRAGMA table_info(players_base)').all().map(c => c.name);
    if (!pcols.includes('face_url')) db.exec("ALTER TABLE players_base ADD COLUMN face_url TEXT NOT NULL DEFAULT ''");
    const ucols = db.prepare('PRAGMA table_info(users)').all().map(c => c.name);
    if (!ucols.includes('email_verified')) db.exec("ALTER TABLE users ADD COLUMN email_verified INTEGER NOT NULL DEFAULT 0");
    if (!ucols.includes('verify_token')) db.exec("ALTER TABLE users ADD COLUMN verify_token TEXT");
    if (!ucols.includes('verify_expires')) db.exec("ALTER TABLE users ADD COLUMN verify_expires INTEGER");
    db.exec("UPDATE users SET email_verified=1 WHERE email_verified=0 AND verify_token IS NULL");
  } else {
    // PG migrations - safe ALTERs
    const alters = [
      "ALTER TABLE members ADD COLUMN IF NOT EXISTS club_id INTEGER",
      "ALTER TABLE members ADD COLUMN IF NOT EXISTS brand_budget BIGINT NOT NULL DEFAULT 25000000",
      "ALTER TABLE members ADD COLUMN IF NOT EXISTS phone TEXT NOT NULL DEFAULT ''",
      "ALTER TABLE fixtures ADD COLUMN IF NOT EXISTS leg INTEGER NOT NULL DEFAULT 1",
      "ALTER TABLE leagues ADD COLUMN IF NOT EXISTS draft_options TEXT",
      "ALTER TABLE leagues ADD COLUMN IF NOT EXISTS market_open INTEGER NOT NULL DEFAULT 1",
      "ALTER TABLE draft_picks ADD COLUMN IF NOT EXISTS pos TEXT",
      "ALTER TABLE draft_picks ADD COLUMN IF NOT EXISTS ovr INTEGER",
      "ALTER TABLE draft_picks ADD COLUMN IF NOT EXISTS band TEXT",
      "ALTER TABLE club_players ADD COLUMN IF NOT EXISTS draft_pos TEXT",
      "ALTER TABLE club_players ADD COLUMN IF NOT EXISTS draft_ovr INTEGER",
      "ALTER TABLE club_players ADD COLUMN IF NOT EXISTS draft_band TEXT",
      "ALTER TABLE clubs ADD COLUMN IF NOT EXISTS crest_url TEXT NOT NULL DEFAULT ''",
      "ALTER TABLE clubs ADD COLUMN IF NOT EXISTS kit_url TEXT NOT NULL DEFAULT ''",
      "ALTER TABLE players_base ADD COLUMN IF NOT EXISTS face_url TEXT NOT NULL DEFAULT ''",
      "ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified INTEGER NOT NULL DEFAULT 0",
      "ALTER TABLE users ADD COLUMN IF NOT EXISTS verify_token TEXT",
      "ALTER TABLE users ADD COLUMN IF NOT EXISTS verify_expires BIGINT",
    ];
    for (const a of alters) await execRaw(a);
    await execRaw("UPDATE users SET email_verified=1 WHERE email_verified=0 AND verify_token IS NULL");
  }

  // lineup cleanup
  const rows = await qall('SELECT member_id,slots FROM lineups');
  for (const row of rows) {
    let slots; try { slots = JSON.parse(row.slots); } catch { continue; }
    const owned = await qall('SELECT id,base_id FROM club_players WHERE member_id=?', row.member_id);
    const valid = new Set(owned.map(p => p.id));
    const byBase = new Map(owned.map(p => [p.base_id, p.id]));
    let changed = false;
    const fixed = slots.map(id => {
      if (id == null || valid.has(id)) return id;
      const cp = byBase.get(id);
      if (cp) { changed = true; return cp; }
      if (id !== null) { changed = true; return null; }
      return id;
    });
    if (changed) await qrun('UPDATE lineups SET slots=? WHERE member_id=?', JSON.stringify(fixed), row.member_id);
  }
  await ensureSeed();
}

let seeded = false;
async function ensureSeed() {
  if (seeded) return;
  const n = (await qone('SELECT count(*) AS n FROM players_base')).n;
  if (Number(n) > 0) { seeded = true; return; }
  seeded = true;
  try {
    const { main } = require('./seed');
    await main();
    console.log('[db] seed automático concluído');
  } catch (e) { seeded = false; console.error('[db] seed automático falhou:', e.message); }
}

async function member(dbLeagueId, slot) { return qone('SELECT * FROM members WHERE league_id=? AND slot=?', dbLeagueId, slot); }
async function notify(memberId, text) {
  await qrun('INSERT INTO notifications(member_id,text,created_at) VALUES (?,?,?)', memberId, String(text), Date.now());
  if (global.broadcast) global.broadcast(memberId, { type: 'notification', text: String(text) });
}
async function moneyLog(leagueId, memberId, note, amount) {
  await qrun('INSERT INTO tx(league_id,member_id,note,amount,created_at) VALUES (?,?,?,?,?)', leagueId, memberId, note, amount, Date.now());
}

module.exports = { db, pgPool, init, all: qall, one: qone, run: qrun, tx, execRaw, member, notify, moneyLog, DB_PATH, IS_PG };
