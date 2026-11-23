const { all, one } = require('./db');
const { FORMS, GAMES, getLineup, standings, teamAt, draftPickCount, draftAllowedPos } = require('./util');
const { clubDTO } = require('./clubs');
const { CATALOG } = require('./sponsors');

async function playerDTO(cp) {
  const pos = cp.draft_pos || cp.pos, ovr = cp.draft_ovr || cp.ovr;
  return {
    id: cp.cp_id, rid: cp.rid, name: cp.name, pos, basePos: cp.pos, ovr, baseOvr: cp.ovr,
    age: cp.age, value: cp.value, salary: cp.wage, club: cp.club, nat: cp.nat,
    goals: cp.goals, assists: cp.assists, status: cp.status, band: cp.draft_band || null,
  };
}

const CP_SELECT = `SELECT cp.id AS cp_id, cp.status, cp.goals, cp.assists, cp.draft_pos, cp.draft_ovr, cp.draft_band,
  b.id AS rid, b.name, b.pos, b.ovr, b.age, b.value, b.wage, b.club, b.nat
  FROM club_players cp JOIN players_base b ON b.id=cp.base_id`;

async function marketPlayers(leagueId) {
  return (await all(CP_SELECT + ' WHERE cp.league_id=? AND cp.member_id IS NULL ORDER BY b.ovr DESC LIMIT 40', leagueId)).map(playerDTO);
}

async function teamSquad(leagueId, memberId) {
  return (await all(CP_SELECT + ' WHERE cp.league_id=? AND cp.member_id=? ORDER BY b.ovr DESC', leagueId, memberId)).map(playerDTO);
}

async function teamDTO(m) {
  const squad = await teamSquad(m.league_id, m.id);
  return {
    id: m.slot, memberId: m.id, name: m.team, coach: m.coach, phone: m.phone || '', club: await clubDTO(m.club_id),
    isAI: !!m.is_ai, userId: m.user_id, slot: m.slot,
    squad, avg: squad.length ? Math.round(squad.reduce(async (a, p) => a + p.ovr, 0) / squad.length) : 0,
  };
}

async function offerDTO(o, meSlot, members) {
  const tn = slot => (members.find(async m => m.slot === slot) || {}).team || 'Time';
  const toName = tn(o.to_id), fromName = tn(o.from_id);
  const swap = o.swap_id ? await one(`SELECT b.name FROM club_players cp JOIN players_base b ON b.id=cp.base_id WHERE cp.id=?`, o.swap_id) : null;
  return {
    id: o.id, kind: o.kind, dir: o.from_slot === meSlot ? 'out' : 'in',
    teamId: o.from_slot === meSlot ? o.to_slot : o.from_slot,
    tn: o.from_slot === meSlot ? toName : fromName,
    pid: o.player_id, pn: o.p_name || '', pos: o.p_pos || '', ovr: o.p_ovr || 0,
    swapId: o.swap_id, sn: swap ? swap.name : null,
    amount: o.amount, status: o.status, d: o.created_at,
    loanRounds: o.kind === 'loan' ? Number(o.note) || 5 : null,
  };
}

async function build(leagueId, viewerUserId) {
  const l = await one('SELECT * FROM leagues WHERE id=?', leagueId);
  if (!l) return null;
  const members = await all('SELECT * FROM members WHERE league_id=? ORDER BY slot', leagueId);
  const me = members.find(async m => m.user_id === viewerUserId) || members.find(async m => m.slot === 0);
  if (!me) return null;
  const isOwner = l.owner_id === viewerUserId || me.slot === 0;

  const offers = (await all(`SELECT o.*, f.slot AS from_slot, t.slot AS to_slot, b.name AS p_name, b.pos AS p_pos, b.ovr AS p_ovr
    FROM offers o JOIN members f ON f.id=o.from_id JOIN members t ON t.id=o.to_id
    JOIN club_players cp ON cp.id=o.player_id JOIN players_base b ON b.id=cp.base_id
    WHERE o.league_id=? ORDER BY o.created_at DESC LIMIT 60`, leagueId)).map(o => offerDTO(o, me.slot, members));

  const memberCount = (await one('SELECT count(*) AS n FROM members WHERE league_id=?', leagueId)).n;
  const fixtures = await Promise.all((await all(`SELECT f.*, h.team AS home, a.team AS away, h.slot AS home_slot, a.slot AS away_slot, h.phone AS home_phone, a.phone AS away_phone
    FROM fixtures f LEFT JOIN members h ON h.id=f.home_id LEFT JOIN members a ON a.id=f.away_id
    WHERE f.league_id=? ORDER BY f.id DESC LIMIT 300`, leagueId)).map(async f => {
      const r = await one('SELECT events,photo,note,updated_at FROM match_reports WHERE fixture_id=?', f.id);
      return { id: f.id, competition: f.competition, round: f.round, leg: f.leg || 1, home: f.home, away: f.away,
        homeSlot: f.home_slot, awaySlot: f.away_slot, homeId: f.home_id, awayId: f.away_id,
        homePhone: f.home_phone || '', awayPhone: f.away_phone || '',
        hs: f.home_score, as: f.away_score, status: f.status, d: f.played_at,
        report: r ? { events: (() => { try { return JSON.parse(r.events); } catch { return { goals: [], cards: [], injuries: [] }; } })(),
          photo: r.photo, note: r.note, updatedAt: r.updated_at } : null };
    }));

  const auctions = await Promise.all((await all('SELECT * FROM auctions WHERE league_id=? ORDER BY id DESC', leagueId)).map(async a => {
    const p = await one(CP_SELECT + ' WHERE cp.id=?', a.player_id);
    const bids = (await all(`SELECT b.*,m.team FROM bids b JOIN members m ON m.id=b.member_id WHERE b.auction_id=? ORDER BY b.amount DESC`, a.id))
      .map(b => ({ memberId: b.member_id, team: b.team, amount: b.amount, d: b.created_at }));
    return { id: a.id, pid: a.player_id, p: p ? playerDTO(p) : null, endsAt: a.ends_at,
      status: a.status, winnerId: a.winner_id, amount: a.winner_amount, bids };
  }));

  const loans = (await all(`SELECT lo.*, b.name, m.team AS to_team FROM loans lo
    JOIN club_players cp ON cp.id=lo.player_id JOIN players_base b ON b.id=cp.base_id
    JOIN members m ON m.id=lo.to_id WHERE lo.league_id=? AND lo.status="ativo"`, leagueId))
    .map(x => ({ id: x.id, pid: x.player_id, name: x.name, to: x.to_team, endsRound: x.ends_round, fee: x.fee }));

  const preContracts = (await all(`SELECT o.*, b.name FROM offers o JOIN club_players cp ON cp.id=o.player_id
    JOIN players_base b ON b.id=cp.base_id WHERE o.league_id=? AND o.kind="precontract" AND o.status="aceita" AND o.from_id=?`, leagueId, me.id))
    .map(o => ({ id: o.id, pid: o.player_id, name: o.name, season: Number(o.note) || l.season + 1 }));

  const notifications = (await all('SELECT * FROM notifications WHERE member_id=? ORDER BY id DESC LIMIT 20', me.id))
    .map(n => ({ id: n.id, text: n.text, read: !!n.read, d: n.created_at }));

  let draft = null;
  if (l.phase === 'draft') {
    const order = JSON.parse(l.draft_order || '[]');
    const total = order.length * l.rounds;
    const myCount = draftPickCount(leagueId, me.id);
    const ctx = draftAllowedPos(leagueId, me.id, me.formation);
    let pending = null;
    try {
      const po = JSON.parse(l.draft_options || 'null');
      if (po && po.pickIndex === l.pick_index && po.memberId === me.id) pending = po;
    } catch {}
    const log = await all(`SELECT d.*,m.team,b.name,b.club,b.nat FROM draft_picks d JOIN members m ON m.id=d.member_id
      JOIN players_base b ON b.id=d.base_id WHERE d.league_id=? ORDER BY d.pick DESC LIMIT 12`, leagueId)
      .map(async x => ({ k: x.pick - 1, team: x.team, name: x.name, pos: x.pos, ovr: x.ovr, band: x.band, club: x.club }));
    draft = {
      k: l.pick_index, total, order: order.map(async s => (members.find(async m => m.slot === s) || {}).team || String(s)),
      slots: order, myTurn: total > 0 && l.pick_index < total && teamAt(order, l.pick_index) === me.slot, meSlot: me.slot,
      rounds: l.rounds, myCount, mode: ctx.mode, required: ctx.required, allowed: ctx.allowed, emptySlots: ctx.emptySlots || [],
      pending, formation: me.formation, log,
    };
  }

  return {
    me: {
      slot: me.slot, memberId: me.id, team: me.team, coach: me.coach, phone: me.phone || '', gameId: me.game_id,
      isOwner, balance: me.balance, formation: me.formation, userId: me.user_id,
      club: await clubDTO(me.club_id),
    },
    league: {
      id: l.id, name: l.name, game: l.game, gameName: (GAMES[l.game] || {}).name || l.game,
      phase: l.phase, season: l.season, round: l.round, startMode: l.start_mode,
      rounds: l.rounds, totalRounds: Math.max(1, (memberCount % 2 === 0 ? memberCount - 1 : memberCount) * 2),
      pickIndex: l.pick_index, invite: l.invite, cupStage: l.cup_stage, marketOpen: !!l.market_open,
    },
    squad: await teamSquad(leagueId, me.id),
    lineup: await getLineup(me.id, me.formation),
    market: await marketPlayers(leagueId),
    teams: members.filter(async m => m.slot !== me.slot).map(teamDTO),
    table: (await standings(leagueId)).map(r => ({ ...r, id: r.slot, coach: r.coach || '', name: r.name || r.team || '' })),
    offers,     tx: (await all('SELECT note,amount,created_at FROM tx WHERE league_id=? AND member_id=? ORDER BY id DESC LIMIT 40', leagueId, me.id)).map(t => ({ t: t.note, v: t.amount, d: t.created_at })),
    fixtures, auctions, loans, preContracts, notifications, draft,
    brands: {
      club: await clubDTO(me.club_id),
      myPick: (await one('SELECT club_id FROM brand_bids WHERE league_id=? AND member_id=?', leagueId, me.id))?.club_id || null,
      picks: await all('SELECT member_id,club_id FROM brand_bids WHERE league_id=?', leagueId),
      options: await Promise.all((await all('SELECT * FROM clubs WHERE game=? ORDER BY strength DESC LIMIT 200', l.game)).map(async c => {
        const d = await clubDTO(c.id);
        d.taken = !!(await one('SELECT id FROM brand_bids WHERE league_id=? AND club_id=?', leagueId, c.id));
        return d;
      })),
    },
    sponsors: {
      catalog: CATALOG,
      deals: await all('SELECT * FROM sponsor_deals WHERE league_id=? AND member_id=? ORDER BY id DESC', leagueId, me.id),
    },
    baseCount: await one('SELECT count(*) AS n FROM players_base WHERE game=?', l.game)?.n || 0,
    pendingIn: offers.filter(o => o.dir === 'in' && o.status === 'pendente').length,
    formations: Object.keys(FORMS),
  };
}

module.exports = { build };
