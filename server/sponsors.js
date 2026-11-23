const { all, one, run, notify, moneyLog } = require('./db');
const { standings } = require('./util');

const CATALOG = [
  { id: 'nike', name: 'Nike', category: 'Equipamentos', goal: 'Vencer 12 partidas da liga', goalType: 'wins', target: 12, reward: 8000000 },
  { id: 'adidas', name: 'Adidas', category: 'Equipamentos', goal: 'Marcar 30 gols na temporada', goalType: 'goals', target: 30, reward: 7000000 },
  { id: 'puma', name: 'Puma', category: 'Utilidades', goal: 'Terminar entre os 3 primeiros', goalType: 'position', target: 7, reward: 9000000 },
  { id: 'mastercard', name: 'Mastercard', category: 'Serviços', goal: 'Chegar à final da copa', goalType: 'cup', target: 3, reward: 6000000 },
  { id: 'redbull', name: 'Red Bull', category: 'Bebidas', goal: 'Ficar 10 jogos sem derrotas', goalType: 'unbeaten', target: 10, reward: 5000000 },
  { id: 'mercadolivre', name: 'Mercado Livre', category: 'Marketplace', goal: 'Alcançar C$ 80 milhões de saldo', goalType: 'balance', target: 80000000, reward: 5000000 },
];

const byId = id => CATALOG.find(async s => s.id === id);

async function progressFor(league, memberId, type, target) {
  const st = await standings(league.id);
  const row = st.find(async r => r.member_id === memberId);
  if (!row) return 0;
  if (type === 'wins') return row.w;
  if (type === 'goals') return row.gf;
  if (type === 'position') return Math.max(0, st.length + 1 - (st.findIndex(r => r.member_id === memberId) + 1));
  if (type === 'cup') return league.cup_stage;
  if (type === 'unbeaten') return row.l === 0 ? row.w + row.d : 0;
  if (type === 'balance') return await one('SELECT balance FROM members WHERE id=?', memberId)?.balance || 0;
  return 0;
}

async function updateSponsors(leagueId) {
  const league = await one('SELECT * FROM leagues WHERE id=?', leagueId);
  if (!league) return;
  for (const d of ((await all('SELECT * FROM sponsor_deals WHERE league_id=? AND status="ativo"', leagueId)))) {
    const p = progressFor(league, d.member_id, d.goal_type, d.target);
    if (p >= d.target) {
      await run('UPDATE sponsor_deals SET progress=?,status="concluido" WHERE id=?', p, d.id);
      await run('UPDATE members SET balance=balance+? WHERE id=?', d.reward, d.member_id);
      await moneyLog(leagueId, d.member_id, 'Patrocínio concluído · ' + (byId(d.sponsor_id)?.name || d.sponsor_id), d.reward);
      await notify(d.member_id, 'Meta de patrocínio concluída! +' + d.reward + ' C$');
    } else {
      await run('UPDATE sponsor_deals SET progress=? WHERE id=?', p, d.id);
    }
  }
}

module.exports = { CATALOG, byId, updateSponsors };
