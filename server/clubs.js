const { all, one, run } = require('./db');
const { norm } = require('./util');

const CURATED = {
  'Real Madrid': { short: 'RMA', country: 'Espanha', c1: '#f4f2ec', c2: '#d8b04a', price: 19000000 },
  'Barcelona': { short: 'BAR', country: 'Espanha', c1: '#a50044', c2: '#004d98', price: 18500000 },
  'Atlético de Madrid': { short: 'ATM', country: 'Espanha', c1: '#cb3524', c2: '#f4f2ec', price: 16500000 },
  'Manchester City': { short: 'MCI', country: 'Inglaterra', c1: '#6cabdd', c2: '#f4f2ec', price: 18500000 },
  'Manchester United': { short: 'MUN', country: 'Inglaterra', c1: '#da291c', c2: '#111111', price: 17500000 },
  'Liverpool': { short: 'LIV', country: 'Inglaterra', c1: '#c8102e', c2: '#f4f2ec', price: 17300000 },
  'Arsenal': { short: 'ARS', country: 'Inglaterra', c1: '#ef0107', c2: '#f4f2ec', price: 16800000 },
  'Chelsea': { short: 'CHE', country: 'Inglaterra', c1: '#034694', c2: '#f4f2ec', price: 16600000 },
  'Tottenham Hotspur': { short: 'TOT', country: 'Inglaterra', c1: '#132257', c2: '#f4f2ec', price: 15800000 },
  'Bayern München': { short: 'BAY', country: 'Alemanha', c1: '#dc052d', c2: '#f4f2ec', price: 18000000 },
  'Borussia Dortmund': { short: 'BVB', country: 'Alemanha', c1: '#fde100', c2: '#1e1e1e', price: 16000000 },
  'Paris Saint-Germain': { short: 'PSG', country: 'França', c1: '#004170', c2: '#da291c', price: 17800000 },
  'Juventus': { short: 'JUV', country: 'Itália', c1: '#111111', c2: '#f4f2ec', price: 16400000 },
  'Inter': { short: 'INT', country: 'Itália', c1: '#0068a8', c2: '#111111', price: 16000000 },
  'AC Milan': { short: 'MIL', country: 'Itália', c1: '#c8102e', c2: '#111111', price: 15900000 },
  'Ajax': { short: 'AJX', country: 'Holanda', c1: '#d2122e', c2: '#f4f2ec', price: 14000000 },
  'FC Porto': { short: 'POR', country: 'Portugal', c1: '#00428c', c2: '#f4f2ec', price: 14500000 },
  'Benfica': { short: 'BEN', country: 'Portugal', c1: '#e30613', c2: '#f4f2ec', price: 14300000 },
  'Sporting CP': { short: 'SCP', country: 'Portugal', c1: '#008542', c2: '#f4f2ec', price: 13500000 },
  'River Plate': { short: 'RIV', country: 'Argentina', c1: '#f4f2ec', c2: '#c8102e', price: 13800000 },
  'Boca Juniors': { short: 'BOC', country: 'Argentina', c1: '#1366af', c2: '#fde100', price: 13700000 },
  'Flamengo': { short: 'FLA', country: 'Brasil', c1: '#c8102e', c2: '#111111', price: 13200000 },
  'Corinthians': { short: 'COR', country: 'Brasil', c1: '#111111', c2: '#f4f2ec', price: 13000000 },
  'Palmeiras': { short: 'PAL', country: 'Brasil', c1: '#006437', c2: '#f4f2ec', price: 12900000 },
  'São Paulo': { short: 'SAO', country: 'Brasil', c1: '#c8102e', c2: '#111111', price: 12500000 },
  'Santos': { short: 'SAN', country: 'Brasil', c1: '#111111', c2: '#f4f2ec', price: 12000000 },
};

function shortOf(name) {
  const words = norm(name).replace(/[^a-z0-9 ]/g, '').split(/\s+/).filter(Boolean);
  if (!words.length) return 'FC';
  if (words.length === 1) return words[0].slice(0, 3).toUpperCase();
  return words.slice(0, 3).map(async w => w[0]).join('').toUpperCase();
}

async function hash(s) {
  let h = 2166136261;
  for (const c of norm(s)) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
}

function colorsOf(name) {
  const h = hash(name);
  const hue = h % 360;
  return [`hsl(${hue} 72% 46%)`, `hsl(${(hue + 145) % 360} 55% 22%)`];
}

async function seedClubs(game) {
  await run('DELETE FROM clubs WHERE game=?', game);
  const rows = await all(`SELECT club,count(*) AS n,avg(ovr) AS a FROM players_base
    WHERE game=? AND club<>'' GROUP BY club HAVING count(*)>=4 ORDER BY avg(ovr) DESC`, game);
  const put = async dbRow => {
    const args=[dbRow.id, game, dbRow.name, dbRow.short, dbRow.country, dbRow.color1, dbRow.color2, dbRow.price, dbRow.strength, dbRow.crestUrl||'', dbRow.kitUrl||''];
    const bad=args.findIndex(a=>a===undefined||typeof a==='object'||typeof a==='function');
    if(bad>=0) throw new Error('bad club param '+bad+':'+args[bad]+' name='+dbRow.name);
    return run(`INSERT INTO clubs(id,game,name,short,country,color1,color2,price,strength,crest_url,kit_url) VALUES (?,?,?,?,?,?,?,?,?,?,?)`, ...args);
  };
  for (let i=0; i<rows.length; i++) { const r = rows[i];
    const curated = CURATED[r.club] || Object.keys(CURATED).find(k => norm(k) === norm(r.club));
    const c = curated ? CURATED[curated] : null;
    const nat = await one(`SELECT nat,count(*) AS n FROM players_base WHERE game=? AND club=? GROUP BY nat ORDER BY n DESC LIMIT 1`, game, r.club);
    const strength = Math.round(r.a);
    const price = c ? c.price : Math.max(1500000, Math.min(12500000, Math.round((strength - 60) * 700000 / 500000) * 500000));
    const [color1, color2] = c ? [c.c1, c.c2] : colorsOf(r.club);
    await put({ id: 1 + i, name: r.club, short: c ? c.short : shortOf(r.club),
      country: c ? c.country : (nat?.nat || 'Internacional'), color1, color2, price, strength, crestUrl:'', kitUrl:'' });
  }
  for (let i = 1; i <= 9; i++) {
    await put({ id: 9000 + i, name: 'Clube Independente ' + ['I','II','III','IV','V','VI','VII','VIII','IX'][i - 1],
      short: 'IND' + i, country: 'Local', color1: '#6d28d9', color2: '#16121f', price: 1000000, strength: 60, crestUrl:'', kitUrl:'' });
  }
  return (await one('SELECT count(*) AS n FROM clubs WHERE game=?', game)).n;
}

async function clubDTO(id) {
  if (!id) return null;
  const c = await one('SELECT * FROM clubs WHERE id=?', id);
  if (!c) return null;
  return { id: c.id, name: c.name, short: c.short, country: c.country,
    color1: c.color1, color2: c.color2, price: c.price, strength: c.strength,
    crestUrl: c.crest_url || '', kitUrl: c.kit_url || '' };
}

module.exports = { CURATED, seedClubs, clubDTO, shortOf };
