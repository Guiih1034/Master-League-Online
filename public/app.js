const $=s=>document.querySelector(s);
const TK='lv_token',PK='lv_profile',LK='lv_league';
let token=localStorage.getItem(TK)||'',leagueId=localStorage.getItem(LK)||'';
let me=null,S=null,screen='auth',tab='home',mk='free',teamSel=null,q='',qp='',brandQ='',authMode='login',leagues=[],lastPlayers=[],qt=null,es=null,matchFilter='all',reportDraft=null;
const GAMES={fc26:'EA FC 26',fc27:'EA FC 27',efoot:'eFootball'};
const FORMS={
'4-3-3':[['ATA',50,12],['PE',18,19],['PD',82,19],['MC',28,45],['VOL',50,55],['MC',72,45],['LE',13,72],['ZAG',37,77],['ZAG',63,77],['LD',87,72],['GOL',50,91]],
'4-4-2':[['ATA',38,13],['ATA',62,13],['PE',13,38],['MC',38,48],['MC',62,48],['PD',87,38],['LE',13,72],['ZAG',37,77],['ZAG',63,77],['LD',87,72],['GOL',50,91]],
'4-2-3-1':[['ATA',50,12],['PE',18,31],['MEI',50,31],['PD',82,31],['VOL',36,53],['VOL',64,53],['LE',13,72],['ZAG',37,77],['ZAG',63,77],['LD',87,72],['GOL',50,91]],
'3-5-2':[['ATA',38,13],['ATA',62,13],['LE',10,40],['MC',30,44],['MEI',50,31],['MC',70,44],['LD',90,40],['ZAG',24,75],['ZAG',50,78],['ZAG',76,75],['GOL',50,91]]
};
const MINQ={GOL:2,ZAG:3,LD:1,LE:1,VOL:1,MC:2,MEI:1,PE:1,PD:1,ATA:2};
const POSOK={GOL:['GOL'],ZAG:['ZAG','VOL','LD','LE'],LD:['LD','LE','ZAG','PD'],LE:['LE','LD','ZAG','PE'],VOL:['VOL','MC','ZAG'],MC:['MC','VOL','MEI'],MEI:['MEI','MC','ATA','PE'],PE:['PE','PD','ATA','MEI'],PD:['PD','PE','ATA'],ATA:['ATA','PE','PD','MEI']};
const POS=['','GOL','ZAG','LD','LE','VOL','MC','MEI','PE','PD','ATA'];
const KINDS={transfer:'Transferência',buyout:'Multa',loan:'Empréstimo',precontract:'Pré-contrato'};
const ICON={
home:'<path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/>',
squad:'<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.5 3-6 6.5-6s6.5 2.5 6.5 6"/><circle cx="17.5" cy="9" r="2.5"/><path d="M17 14c2.8 0 4.5 2 4.5 5"/>',
market:'<path d="M4 8h14l-3-3M20 16H6l3 3"/>',
money:'<rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10h18"/><circle cx="16.5" cy="14.5" r="1"/>',
  league:'<path d="M8 4h8v6a4 4 0 01-8 0V4z"/><path d="M8 6H4a3 3 0 003 4M16 6h4a3 3 0 01-3 4M12 14v4M8 20h8"/>',
  matches:'<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 7h2M14 7h2M8 11h2M14 11h2M8 15h2M14 15h2M10 21v-2h4v2"/>'
};
const TABS=[['home','Início'],['squad','Elenco'],['matches','Partidas'],['market','Mercado'],['money','Finanças'],['league','Ligas']];
const nf=n=>Math.round(n||0).toLocaleString('pt-BR');
const money=n=>'C$ '+nf(n);
const short=n=>n>=1e6?(n/1e6).toFixed(2).replace('.',',')+' mi':n>=1e3?Math.round(n/1e3)+' mil':String(n);
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const tier=o=>o>=85?'t1':o>=78?'t2':o>=70?'t3':'t0';
const pad=n=>String(n).padStart(3,'0');
const faceSrc=p=>{if(!p)return ''; if(p.faceUrl||p.id) return '/api/img/player/'+p.id+'/face'; if(!p.rid) return ''; const rid=+p.rid; const a=String(Math.floor(rid/1000)).padStart(3,'0'),b=String(rid%1000).padStart(3,'0'); return '/api/img/face/'+a+'/'+b+'/26_120.png';};
const face=p=>{const src=faceSrc(p); return src?'<img src=\"'+src+'\" alt=\"" loading=\"lazy\" style=\"width:62px;height:62px;border-radius:12px;margin-left:auto;background:var(--card2);object-fit:cover\" onerror=\"this.style.display=\'none\'\">':'';};
const faceBox=(p,size=40,cls='')=>{const o=p?.ovr??p?.o??'-'; const n=size; const src=faceSrc(p); const fb=`<div class="ovr ${tier(+o||0)} ${cls}" style="width:${n}px;height:${n}px;font-size:${Math.max(12,Math.round(n*.42))}px;margin:0;flex:none">${o}</div>`; if(!src) return fb; return `<div style="width:${n}px;height:${n}px;flex:none;position:relative"><img src="${src}" alt="" loading="lazy" style="width:${n}px;height:${n}px;border-radius:${Math.max(8,Math.round(n*.22))}px;background:var(--card2);object-fit:cover;display:block" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"><div class="ovr ${tier(+o||0)} ${cls}" style="display:none;width:${n}px;height:${n}px;font-size:${Math.max(12,Math.round(n*.42))}px;margin:0">${o}</div></div>`;};
const norm=s=>String(s==null?'':s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
function crestSVG(c,size=44){
  if(!c)return '';
  const n=Number(size)||44;
  if(c.id) return `<img src="/api/img/club/${c.id}/crest" alt="${esc(c.name||'')}" style="width:${n}px;height:${n}px;object-fit:contain;flex:none" loading="lazy" onerror="this.style.display='none';this.nextElementSibling&&(this.nextElementSibling.style.display='inline-flex')"><span style="display:none;width:${n}px;height:${n}px;align-items:center;justify-content:center;border-radius:12px;background:linear-gradient(135deg,${esc(c.color1||'#4c1d95')},${esc(c.color2||'#a855f7')});font:700 ${Math.max(11,Math.round(n*.34))}px 'Barlow Condensed',sans-serif;color:#fff">${esc(c.short||'?')}</span>`;
  return `<span style="display:inline-flex;width:${n}px;height:${n}px;align-items:center;justify-content:center;border-radius:12px;background:linear-gradient(135deg,${esc(c.color1||'#4c1d95')},${esc(c.color2||'#a855f7')});font:700 ${Math.max(11,Math.round(n*.34))}px 'Barlow Condensed',sans-serif;color:#fff;flex:none">${esc(c.short||'?')}</span>`;
}
function kitSVG(c,size=44){
  if(!c)return '';
  const n=Number(size)||44;
  if(c.id) return `<img src="/api/img/club/${c.id}/kit" alt="Uniforme ${esc(c.name||'')}" style="width:${n}px;height:${n}px;object-fit:contain;flex:none" loading="lazy" onerror="this.style.display='none';this.nextElementSibling&&(this.nextElementSibling.style.display='inline-flex')"><span style="display:none;width:${n}px;height:${n}px;align-items:center;justify-content:center;border-radius:10px;background:${esc(c.color2||'#1c172b')};border:2px solid ${esc(c.color1||'#a855f7')};font:700 ${Math.max(10,Math.round(n*.28))}px Inter,sans-serif;color:#fff">${esc(c.short||'?')}</span>`;
  return `<span style="display:inline-flex;width:${n}px;height:${n}px;align-items:center;justify-content:center;border-radius:10px;background:${esc(c.color2||'#1c172b')};border:2px solid ${esc(c.color1||'#a855f7')};font:700 ${Math.max(10,Math.round(n*.28))}px Inter,sans-serif;color:#fff;flex:none">${esc(c.short||'?')}</span>`;
}function getProfile(){try{return Object.assign({team:'Meu Time FC',coach:'',gid:'',phone:''},JSON.parse(localStorage.getItem(PK)||'{}'))}catch(e){return{team:'Meu Time FC',coach:'',gid:'',phone:''}}}
function toast(m){const t=$('#toast');t.textContent=m;t.classList.add('show');clearTimeout(toast.h);toast.h=setTimeout(()=>t.classList.remove('show'),2400)}
function openSheet(html){$('#sheet').innerHTML='<div class="grab"></div>'+html;$('#ov').classList.add('show');requestAnimationFrame(()=>$('#sheet').classList.add('show'))}
function closeSheet(){$('#sheet').classList.remove('show');$('#ov').classList.remove('show')}
function unread(){return S&&S.notifications?S.notifications.filter(n=>!n.read).length:0}
function payroll(){return S&&S.squad?S.squad.reduce((a,p)=>a+(p.salary||0),0):0}
async function api(path,opt={}){
  const h={'Content-Type':'application/json'};
  if(token)h.Authorization='Bearer '+token;
  let r;
  try{r=await fetch('/api'+path,{...opt,headers:{...h,...(opt.headers||{})}})}catch(e){throw new Error('Servidor indisponível')}
  let d={};try{d=await r.json()}catch(e){}
  if(!r.ok)throw new Error(d.error||('Erro '+r.status));
  if(d.state){S=d.state;render()}
  return d;
}
async function loadState(id){const d=await api('/leagues/'+id);leagueId=String(id);localStorage.setItem(LK,leagueId);screen='app';if(S&&S.league.phase==='brand')tab='home';render();return d}
async function screenLeagues(){screen='leagues';render();try{const d=await api('/leagues');leagues=d.leagues||[];render()}catch(e){toast(e.message)}}
function startEvents(){
  try{
    if(es)es.close();
    es=new EventSource('/api/events');
    es.onmessage=e=>{
      try{
        const d=JSON.parse(e.data);
        if(d.type==='notification'){
          if(leagueId&&screen==='app')api('/leagues/'+leagueId).catch(()=>{});
          else if(d.text)toast(d.text);
        }
      }catch(_){}
    };
    es.onerror=()=>{};
  }catch(_){}
}
function standings(){return [...(S.table||[])].sort((a,b)=>b.pts-a.pts||b.w-a.w||(b.gf-b.ga)-(a.gf-a.ga)||String(a.name).localeCompare(String(b.name)))}
function tableHTML(rows,limit){
  return '<table><tr><th>#</th><th>Time</th><th>J</th><th>V</th><th>E</th><th>D</th><th>Pts</th></tr>'+
    rows.slice(0,limit||rows.length).map((r,i)=>`<tr class="${r.id===S.me.slot?'me':''}"><td>${i+1}</td><td>${esc(r.name||r.team||'Time')}${r.coach?` <span class="mut small">(${esc(r.coach)})</span>`:''}</td><td>${r.played!=null?r.played:r.w+r.d+r.l}</td><td>${r.w}</td><td>${r.d}</td><td>${r.l}</td><td><b>${r.pts}</b></td></tr>`).join('')+'</table>';
}
function gameOptions(sel){return Object.keys(GAMES).map(g=>`<option value="${g}" ${g===sel?'selected':''}>${GAMES[g]}</option>`).join('')}
function roundOptions(sel){return [15,18,23].map(n=>`<option value="${n}" ${n===sel?'selected':''}>${n} jogadores por time</option>`).join('')}
function posChips(){return POS.map(p=>`<button class="chip ${qp===p?'on':''}" data-a="qpos" data-p="${p}">${p||'Todas'}</button>`).join('')}
function fxHTML(f){return `<div class="pl" style="cursor:default"><div class="info"><b style="font-size:14px">${esc(f.home)} × ${esc(f.away)}</b><span class="mut small">${f.competition==='cup'?'Copa':f.competition==='friendly'?'Amistoso':'Liga'} · ${f.status==='pendente'?'a jogar':'rodada '+f.round}</span></div><b>${f.status==='jogado'?f.hs+' × '+f.as:'—'}</b></div>`}

function vAuth(){
  const reg=authMode==='register';
  const verified=new URLSearchParams(location.search).get('verified');
  return `<div class="card mid" style="margin-top:26px"><div class="brand" style="justify-content:center"><img src="logo.jpeg" alt="Master League Online" style="width:240px;height:240px;max-width:none"></div><div class="mut small" style="margin-top:8px">Seu clube, sua liga, sua temporada</div></div>
  <div class="card"><div class="sec">${reg?'Criar conta':'Entrar'}</div>
  ${verified?'<div class="note ok">E-mail confirmado. Agora você pode entrar.</div>':''}
  ${reg?'<label>Seu nome</label><input id="a-name" placeholder="Nome do técnico" autocomplete="name">':''}
  <label>E-mail</label><input id="a-email" type="email" placeholder="voce@email.com" autocomplete="email">
  <label>Senha</label><input id="a-pass" type="password" placeholder="Mínimo de 6 caracteres" autocomplete="current-password">
  <div class="btns"><button class="btn" data-a="authGo">${reg?'Cadastrar':'Entrar'}</button><button class="btn ghost" data-a="authMode">${reg?'Já tenho conta':'Criar conta'}</button></div>
  <div class="btns" style="margin-top:8px"><button class="btn ghost sm" data-a="resendVerify">Reenviar verificação</button></div></div>
  <div class="foot">Master League Online — gerenciador de liga de futebol</div>`;
}function vLeaguesScreen(){
  const pr=getProfile();
  return `<div class="card"><div class="sec">Minhas ligas <span class="mut small">${leagues.length}</span></div>
  ${leagues.map(l=>`<div class="pl" style="cursor:default"><div class="avatar" style="width:44px;height:44px;font-size:20px;border-radius:12px;cursor:pointer" data-a="openLeague" data-id="${l.id}">${esc((l.name||'?').trim()[0]||'?').toUpperCase()}</div><div class="info" data-a="openLeague" data-id="${l.id}" style="cursor:pointer"><b>${esc(l.name)}</b><span class="mut small">${esc(GAMES[l.game]||l.game)} · ${l.phase==='brand'?'Escolha de clube':l.phase==='draft'?'Draft':'Temporada '+l.season} · Rodada ${l.round}</span></div><div style="text-align:right"><span class="chip">${l.isOwner||l.slot===0?'Dono':'Técnico'}</span>${l.isOwner||l.slot===0?`<div style="margin-top:6px"><button class="btn danger sm" data-a="deleteLeagueFromList" data-id="${l.id}" data-name="${esc(l.name)}">Excluir</button></div>`:''}</div></div>`).join('')||'<div class="mut small">Você ainda não está em nenhuma liga. Crie uma abaixo ou use um código de convite.</div>'}</div>
  <div class="card"><div class="sec">Criar liga</div>
  <label>Nome da liga</label><input id="c-name" value="Minha Liga" maxlength="40">
  <label>Jogo</label><select id="c-game">${gameOptions('fc26')}</select>
  <label>Como a liga começa</label><select id="c-mode"><option value="draft">Draft</option><option value="random">Sorteio automático</option></select>
  <label>Rodadas (jogadores por time no draft)</label><select id="c-rounds">${roundOptions(15)}</select>
  <label>Nome do time</label><input id="c-team" value="${esc(pr.team)}" maxlength="24">
  <label>Seu nome de técnico</label><input id="c-coach" value="${esc(pr.coach||(me&&me.name)||'')}" maxlength="30">
  <label>WhatsApp (com DDD)</label><input id="c-phone" value="${esc(pr.phone||'')}" inputmode="tel" maxlength="20">
  <div class="btns"><button class="btn" data-a="createLeague">Criar liga</button></div></div>
  <div class="card"><div class="sec">Entrar com convite</div>
  <label>Código de convite</label><input id="j-invite" placeholder="EX.: A1B2C3D4" style="text-transform:uppercase">
  <label>Nome do time</label><input id="j-team" value="${esc(pr.team)}" maxlength="24">
  <label>Técnico</label><input id="j-coach" value="${esc(pr.coach||(me&&me.name)||'')}" maxlength="30">
  <label>WhatsApp (com DDD)</label><input id="j-phone" value="${esc(pr.phone||'')}" inputmode="tel" maxlength="20">
  <div class="btns"><button class="btn" data-a="joinLeague">Entrar</button></div></div>`;
}
function vHome(){
  const st=standings(), pos=st.findIndex(r=>r.id===S.me.slot)+1, meRow=st[pos-1]||{pts:0,w:0,d:0,l:0,gf:0,ga:0};
  const wage=(S.squad||[]).reduce((a,p)=>a+(+p.salary||0),0);
  const available=(+S.me.balance||0)-wage;
  const fx=S.fixtures||[];
  const pend=fx.filter(f=>f.status==='pendente'||f.status==='aceito').slice(0,5);
  const done=fx.filter(f=>f.status==='jogado').slice().reverse().slice(0,5);
  const tx=(S.tx||[]).slice(0,6);
  const best=(S.squad||[]).reduce((a,p)=>!a||p.ovr>a.ovr?p:a,null);
  const next=pend[0];
  const myFx=f=>f.homeSlot===S.me.slot||f.awaySlot===S.me.slot;
  const fxRow=f=>{
    const mine=myFx(f), opp=mine?fxOpponent(f):null;
    const score=f.status==='jogado'?f.hs+' x '+f.as:(f.status==='aceito'?'marcar':'-');
    const canMark=mine&&f.status!=='jogado'&&opp&&opp.phone;
    const act=f.status==='jogado'?'<button class="btn ghost sm" data-a="matchSheet" data-id="'+f.id+'">Ficha</button>':(canMark?'<button class="btn sm" data-a="markGame" data-id="'+f.id+'">Marcar</button>':(mine?'<button class="btn ghost sm" data-a="matchSheet" data-id="'+f.id+'">Detalhes</button>':''));
    const comp=f.competition==='cup'?'Copa':f.competition==='friendly'?'Amistoso':'Liga';
    const leg=f.leg?(f.leg===1?' · Ida':' · Volta'):'';
    const stt=f.status==='jogado'?'jogado':(f.status==='aceito'?'aceito':'pendente');
    return '<div class="pl" style="cursor:default"><div class="info"><b style="font-size:14px">'+esc(f.home)+' x '+esc(f.away)+'</b><span class="mut small">'+comp+leg+' · '+stt+'</span></div><div style="text-align:right"><b>'+score+'</b><div style="margin-top:6px">'+act+'</div></div></div>';
  };
  const txRow=t=>{
    const v=+t.v||0, posv=v>=0; const when=t.d?new Date(t.d).toLocaleDateString('pt-BR'):'';
    return '<div class="pl" style="cursor:default"><div class="info"><b style="font-size:14px">'+esc(t.t||'Movimentação')+'</b><span class="mut small">'+when+'</span></div><b style="color:'+(posv?'#4ade80':'#f87171')+'">'+(posv?'+':'')+money(v)+'</b></div>';
  };
  const crest=S.me.club?'<div class="row" style="gap:6px">'+crestSVG(S.me.club,38)+kitSVG(S.me.club,34)+'</div>':'';
  const bestLine=best?'<div class="note mt">Destaque: <b>'+esc(best.name)+'</b> ('+esc(best.pos)+' '+best.ovr+') · Elenco '+(S.squad||[]).length+' jogadores</div>':'';
  const nextLine=next?'<div class="note mt">Próximo jogo: <b>'+esc(next.home)+' x '+esc(next.away)+'</b> '+(next.leg?(next.leg===1?'(Ida)':'(Volta)'):'')+'</div>':'';
  return '<div class="stats">'+'<div><b>'+money(S.me.balance)+'</b><span>Saldo</span></div>'+'<div><b style="color:#f87171">'+money(wage)+'</b><span>Folha salarial</span></div>'+'<div><b style="color:'+(available>=0?'#4ade80':'#f87171')+'">'+money(available)+'</b><span>Disponível</span></div></div>'+'<div class="card"><div class="sec">Meu time</div><div class="row"><div class="grow"><div class="big" style="font-size:24px">'+esc(S.me.team||'Meu Time')+'</div><div class="mut small">'+(pos?pos+'º lugar':'')+' · '+(meRow.pts||0)+' pts · '+(meRow.w||0)+'V '+(meRow.d||0)+'E '+(meRow.l||0)+'D · Saldo '+((meRow.gf||0)-(meRow.ga||0))+'</div></div>'+crest+'</div>'+bestLine+nextLine+'</div>'+'<div class="card"><div class="sec">Últimos resultados</div>'+(done.length?done.map(fxRow).join(''):'<div class="mut small">Nenhum resultado ainda. Registre na aba Partidas.</div>')+'</div>'+'<div class="card"><div class="sec">Próximos / pendentes</div>'+(pend.length?pend.map(fxRow).join(''):'<div class="mut small">Nenhuma partida pendente.</div>')+'</div>'+'<div class="card"><div class="sec">Últimas do mercado</div>'+(tx.length?tx.map(txRow).join(''):'<div class="mut small">Sem movimentações ainda.</div>')+'</div>'+'<div class="card"><div class="sec">Classificação · '+esc(S.league.name)+'</div>'+(meRow?'<div class="mut small" style="margin-bottom:8px">Seu time: <b>'+esc(meRow.name||meRow.team||'Time')+(meRow.coach?' ('+esc(meRow.coach)+')':'')+'</b></div>':'')+tableHTML(st)+'</div>';
}

const DRAFT_POS=['GOL','ZAG','LD','LE','VOL','MC','MEI','PD','PE','ATA'];
function draftName(slot){const d=S.draft,i=d.slots.indexOf(slot);return i>=0&&d.order[i]?d.order[i]:('Time '+slot)}
function draftSlot(k){const d=S.draft,n=d.slots.length,r=Math.floor(k/n),i=k%n;return r%2===0?d.slots[i]:d.slots[n-1-i]}
function vDraft(){
  const d=S.draft,n=d.slots.length,round=Math.floor(d.k/n)+1;
  const up=[];for(let k=d.k+1;k<Math.min(d.total,d.k+9);k++)up.push(draftName(draftSlot(k)));
  const f=d.formation||S.me.formation||'4-3-3',sl=FORMS[f]||FORMS['4-3-3'],on=new Set(S.lineup||[]);
  const canPickSlot=(i)=>d.myTurn&&d.mode==='starter'&&!(S.lineup||[])[i]&&(d.allowed||[]).includes(sl[i][0]);
  const pitch=`<div class="pitch"><svg viewBox="0 0 100 125" fill="none" stroke="rgba(255,255,255,.55)" stroke-width=".5">
  <rect x="4" y="4" width="92" height="117"/><path d="M4 62.5h92"/><circle cx="50" cy="62.5" r="10"/>
  <rect x="27" y="4" width="46" height="18"/><rect x="27" y="103" width="46" height="18"/><rect x="38" y="4" width="24" height="7"/><rect x="38" y="114" width="24" height="7"/></svg>`+
  sl.map(([pos,x,y],i)=>{const p=S.squad.find(z=>z.id===S.lineup[i]); if(p) return `<div class="slot" style="left:${x}%;top:${y}%">${faceBox(p,40)}<div class="nm">${esc(p.name)} (${p.ovr})</div></div>`; const ok=canPickSlot(i); return `<div class="slot ${ok?'pick':''}" style="left:${x}%;top:${y}%" ${ok?`data-a="droll" data-pos="${pos}"`:''}><div class="ovr empty">${pos}</div></div>`;}).join('')+'</div>';
  const bench=[...S.squad].filter(p=>!on.has(p.id)).sort((a,b)=>b.ovr-a.ovr);
  const benchHTML=bench.length?bench.map(p=>`<div class="pl" style="cursor:default;padding:7px 0">${faceBox(p,32)}<div class="info"><b style="font-size:14px">${esc(p.name)} (${p.ovr})</b><span class="mut small">${esc(p.pos)}${p.band?` • ${esc(p.band)}`:``} • ${esc(p.club||'')}</span></div></div>`).join(''):"<div class=\"mut small\">Nenhum reserva ainda.</div>";
  let action='';
  if(d.myTurn){
    if(d.pending && d.pending.options && d.pending.options.length){
      action=`<div class="card" style="border-color:rgba(168,85,247,.5)"><div class="sec">Opções sorteadas • ${esc(d.pending.pos)}</div><div class="mut small" style="margin-bottom:8px">5 jogadores sorteados (overall e faixa por probabilidade). Escolha 1.</div>${d.pending.options.map(o=>`<div class="pl" data-a="dpickOpt" data-id="${o.baseId}">${faceBox(o,38)}<div class="info"><b>${esc(o.name)} (${o.ovr})</b><span class="mut small">${esc(o.pos)} • ${esc(o.club||'Sem clube')} • ${esc(o.nat||'')}${o.band?' • faixa '+esc(o.band):''}</span></div><span class="chip">Escolher</span></div>`).join('')}</div>`;
    } else if(d.mode==='starter'){
      action=`<div class="note mt">Toque em uma posição vazia no campo para sortear 5 opções para titular.</div>`;
    } else if(d.mode==='reserve_gk'){
      action=`<div class="card"><div class="sec">1º reserva obrigatório</div><div class="mut small" style="margin-bottom:8px">O 12º jogador deve ser goleiro (GOL).</div><button class="btn" data-a="droll" data-pos="GOL">Sortear 5 goleiros</button></div>`;
    } else {
      action=`<div class="card"><div class="sec">Escolher reserva</div><div class="mut small" style="margin-bottom:8px">Selecione a posição desejada e sorteie 5 opções.</div><div class="wrap">${DRAFT_POS.map(p=>`<button class="chip" data-a="droll" data-pos="${p}">${p}</button>`).join('')}</div></div>`;
    }
  }
  const log=(d.log||[]).slice().reverse().map(l=>`<div class="pl" style="cursor:default;padding:8px 0"><span class="mut small" style="width:34px;flex:none">#${(l.k||0)+1}</span><div class="info"><b style="font-size:14px">${esc(l.name)} <span class="mut small">${esc(l.pos)} • ${l.ovr}${l.band?' ('+esc(l.band)+')':''}</span></b></div><span class="mut small">${esc(l.team||'')}</span></div>`).join('');
  const modeTxt=d.mode==='starter'?'Titulares (1-11)':d.mode==='reserve_gk'?'12º pick: GOL obrigatório':'Reservas (posição livre)';
  return `<div class="card" style="border-color:rgba(168,85,247,.5)"><div class="lbl">Draft • rodada ${round} de ${d.rounds}</div>
  <div class="big" style="font-size:30px">${d.myTurn?'Sua vez de escolher':'Aguardando os técnicos'}</div>
  <div class="mut small" style="margin-top:6px">Pick ${Math.min(d.k+1,d.total)} de ${d.total} • ordem snake (${d.slots.indexOf(d.meSlot)+1}º)</div>
  <div class="mut small" style="margin-top:4px">${modeTxt} • ${S.squad.length} de ${d.rounds} escolhidos</div>
  <div class="mut small" style="margin-top:6px">Depois de você: ${up.length?up.map(esc).join(' • '):'fim do draft'}</div>
  <div class="btns"><button class="btn ghost sm" data-a="dauto" ${d.myTurn?'':'disabled'}>Escolha automática</button></div></div>
  ${action}
  <div class="card"><div class="sec">Campo (titulares) <span class="mut small">${f}</span></div>${pitch}</div>
  <div class="card"><div class="sec">Banco / Reservas <span class="mut small">${bench.length}</span></div>${benchHTML}</div>
  ${log?`<div class="card"><div class="sec">Últimas escolhas</div>${log}</div>`:''}`;
}

function vBrands(){
  const b=S.brands||{},all=b.options||[],f=norm(brandQ);
  const opts=all.filter(c=>!f||norm(c.name).includes(f)||norm(c.short).includes(f)||norm(c.country).includes(f));
  const mine=S.me.club,pick=b.myPick;
  return `<div class="card" style="border-color:rgba(168,85,247,.5)"><div class="lbl">Escolha de clube</div>
  <div class="big" style="font-size:26px">${mine?esc(mine.name):'Escolha seu clube'}</div>
  ${mine?`<div class="row" style="margin-top:10px">${crestSVG(mine,48)}${kitSVG(mine,48)}<div class="grow"><div class="mut small">${esc(mine.country)} · média ${mine.strength}</div></div><span class="tag on">SEU CLUBE</span></div>`:'<div class="mut small" style="margin-top:8px">Selecione escudo, nome e uniforme abaixo. Sem custo.</div>'}
  <div class="note mt">Cada técnico escolhe um clube. Você usará este clube com os jogadores do draft/sorteio e deverá reproduzir o elenco no jogo.</div>
  ${(S.me.isOwner||S.me.slot===0)?'<div class="btns"><button class="btn" data-a="brandClose">Confirmar clubes e iniciar</button></div>':''}</div>
  <div class="card"><div class="sec">Clubes disponíveis <span class="mut small">${opts.length} de ${all.length}</span></div>
  <input data-a="brandq" placeholder="Buscar por clube, sigla ou país" value="${esc(brandQ)}" autocomplete="off">
  <div class="list-scroll mt">${opts.map(c=>{
    const isMine=String(pick)===String(c.id),disabled=isMine||c.taken;
    return `<div class="pl" ${disabled?'style="cursor:default"':'data-a="brandBidSheet" data-id="'+esc(c.id)+'"'}>${crestSVG(c,40)}${kitSVG(c,36)}<div class="info"><b>${esc(c.name)}</b><span class="mut small">${esc(c.country)} · média ${c.strength}</span></div><button class="btn sm" data-a="brandBidSheet" data-id="${esc(c.id)}" ${disabled?'disabled':''}>${isMine?'SEU':c.taken?'ESCOLHIDO':'Escolher'}</button></div>`;
  }).join('')||'<div class="mut small">Nenhum clube encontrado.</div>'}</div></div>`;
}
﻿function parseEventLines(text,type,fx){
  return String(text||'').split(/\r?\n/).map(s=>s.trim()).filter(Boolean).map(line=>{
    const mm=line.match(/(\d{1,3})/); const minute=mm?Math.max(1,Math.min(120,+mm[1])):1;
    let rest=(mm?line.replace(mm[0],''):line).replace(/^[\s\-:'",.]+|[\s\-:'",.]+$/g,'').trim();
    let assistName='', name=rest||line;
    if(type==='goals'){
      const sp=rest.split(/\s*(?:\|| - |–|—|, assist\.?| assistido por )\s*/i);
      if(sp.length>1){name=sp[0].trim(); assistName=sp.slice(1).join(' - ').trim();}
      return {pid:null,name:name||rest,minute,assistPid:null,assistName};
    }
    if(type==='cards'){
      const ctype=/vermelh/i.test(rest)?'vermelho':'amarelo';
      name=rest.replace(/\b(amarelo|vermelho|cart[aã]o)\b/ig,'').replace(/^[\s\-:'",.]+|[\s\-:'",.]+$/g,'').trim()||rest;
      return {pid:null,name,minute,type:ctype};
    }
    return {pid:null,name:name||rest,minute};
  }).filter(e=>e.name);
}
function eventLines(events,type){
  const a=(events&&events[type])||[];
  return a.map(e=> type==='goals' ? `${e.minute}' ${e.name}${e.assistName?' - '+e.assistName:''}` : type==='cards' ? `${e.minute}' ${e.name} (${e.type||'amarelo'})` : `${e.minute}' ${e.name}`).join('\n');
}

function onlyDigitsPhone(v){return String(v||'').replace(/\D+/g,'');}
function waLink(phone,msg){const d=onlyDigitsPhone(phone); if(!d) return null; return 'https://wa.me/'+d+'?text='+encodeURIComponent(msg||'');}
function fxOpponent(f){ if(!f||!S||!S.me) return null; if(f.homeSlot===S.me.slot) return {name:f.away, phone:f.awayPhone||''}; if(f.awaySlot===S.me.slot) return {name:f.home, phone:f.homePhone||''}; return null; }
function markFixture(id){
  const fx=(S.fixtures||[]).find(f=>f.id===id); if(!fx) return;
  const opp=fxOpponent(fx);
  if(!opp){ toast('Abra a ficha da partida para registrar o resultado.'); matchSheet(id); return; }
  const leg=fx.leg===2?'volta':'ida';
  const msg='Olá '+opp.name+'! Vamos marcar nosso jogo '+fx.home+' x '+fx.away+' ('+leg+', rodada '+fx.round+' da liga '+(S.league&&S.league.name||'MLO')+')?';
  const url=waLink(opp.phone,msg);
  if(!url){ toast('Adversário sem WhatsApp cadastrado. Peça para ele salvar no Perfil.'); matchSheet(id); return; }
  window.open(url,'_blank');
}

function matchSheet(id,keep){
  const fx=(S.fixtures||[]).find(f=>f.id===id); if(!fx) return;
  if(!keep || !reportDraft || reportDraft.id!==id) reportDraft={id:fx.id, events: fx.report&&fx.report.events ? JSON.parse(JSON.stringify(fx.report.events)) : {goals:[],cards:[],injuries:[]}, photo: fx.report&&fx.report.photo||null};
  const played=fx.status==='jogado';
  const title=`${esc(fx.home)} ${played?(fx.hs+' - '+fx.as):'x'} ${esc(fx.away)}`;
  const rep=fx.report||{};
  const leg=fx.leg===2?'volta':'ida';
  let html=`<h2 style="font-size:22px">${title}</h2><div class="mut small">${fx.competition==='cup'?'Copa':fx.competition==='friendly'?'Amistoso':'Liga'} - ${leg} - rodada ${fx.round} - ${played?'jogada':'pendente'}</div>`;
  if(!played){
    const opp=fxOpponent(fx);
    html+=`<div class="card mt"><div class="sec">Marcar jogo</div><div class="mut small">Combine o horário com o adversário no WhatsApp e registre o resultado aqui após a partida.</div>${opp?`<div class="mut small" style="margin-top:6px">Adversário: <b>${esc(opp.name||'')}</b>${opp.phone?' - '+esc(opp.phone):' (sem WhatsApp cadastrado)'}</div>`:''}
      <div class="row" style="gap:8px;margin-top:10px"><input id="mr-hs" inputmode="numeric" placeholder="Gols casa" style="width:50%"><input id="mr-as" inputmode="numeric" placeholder="Gols fora" style="width:50%"></div>
      <label>Gols (uma por linha: minuto nome - assistência)</label><textarea id="mr-goals" rows="2"></textarea>
      <label>Cartões (uma por linha: minuto nome amarelo/vermelho)</label><textarea id="mr-cards" rows="2"></textarea>
      <label>Lesões (uma por linha: minuto nome)</label><textarea id="mr-injuries" rows="2"></textarea>
      <label>Observações</label><textarea id="mr-note" rows="2"></textarea>
      <label>Foto do resultado</label><input id="mr-photo" type="file" accept="image/jpeg,image/png,image/webp">
      <div class="btns">${opp?`<button class="btn" data-a="markGame" data-id="${fx.id}">Marcar jogo (WhatsApp)</button>`:''}<button class="btn" data-a="saveReport">Salvar resultado</button><button class="btn ghost" data-a="close">Fechar</button></div></div>`;
  } else {
    const ev=reportDraft.events||{goals:[],cards:[],injuries:[]};
    html+=`<div class="card mt"><div class="sec">Ficha da partida</div>
      <label>Gols (uma por linha: minuto nome - assistência)</label><textarea id="mr-goals" rows="3">${esc(eventLines(ev,'goals'))}</textarea>
      <label>Cartões (uma por linha: minuto nome amarelo/vermelho)</label><textarea id="mr-cards" rows="2">${esc(eventLines(ev,'cards'))}</textarea>
      <label>Lesões (uma por linha: minuto nome)</label><textarea id="mr-injuries" rows="2">${esc(eventLines(ev,'injuries'))}</textarea>
      <label>Observações</label><textarea id="mr-note" rows="2">${esc(rep.note||'')}</textarea>
      <label>Foto do resultado</label><input id="mr-photo" type="file" accept="image/jpeg,image/png,image/webp">
      ${(reportDraft.photo||rep.photo)?`<img src="${reportDraft.photo||rep.photo}" alt="" style="width:100%;border-radius:10px;margin-top:8px">`:''}
      <div class="btns"><button class="btn" data-a="saveReport">Salvar ficha</button><button class="btn ghost" data-a="close">Fechar</button></div></div>`;
  }
  openSheet(html);
}
function vSquad(){
  const f=S.me.formation||'4-3-3', sl=FORMS[f]||FORMS['4-3-3'], on=new Set(S.lineup||[]);
  const pitch=`<div class="pitch"><svg viewBox="0 0 100 125" fill="none" stroke="rgba(255,255,255,.55)" stroke-width=".5"><rect x="4" y="4" width="92" height="117"/><path d="M4 62.5h92"/><circle cx="50" cy="62.5" r="10"/><rect x="27" y="4" width="46" height="18"/><rect x="27" y="103" width="46" height="18"/><rect x="38" y="4" width="24" height="7"/><rect x="38" y="114" width="24" height="7"/></svg>`+
    sl.map(([pos,x,y],i)=>{const p=S.squad.find(z=>z.id===S.lineup[i]); if(p) return `<div class="slot" data-a="player" data-id="${p.id}" style="left:${x}%;top:${y}%"><div class="ovr ${tier(p.ovr)}">${p.ovr}</div><div class="nm">${esc(p.name)}</div></div>`; return `<div class="slot pick" data-a="pick" data-i="${i}" style="left:${x}%;top:${y}%"><div class="ovr empty">${pos}</div></div>`;}).join('')+'</div>';
  const bench=[...S.squad].filter(p=>!on.has(p.id)).sort((a,b)=>b.ovr-a.ovr);
  return `<div class="card"><div class="sec">Formação</div><div class="wrap">${(S.formations||Object.keys(FORMS)).map(x=>`<button class="chip ${x===f?'on':''}" data-a="form" data-f="${x}">${x}</button>`).join('')}</div><div class="btns"><button class="btn ghost sm" data-a="autoLineup">Escalação automática</button></div></div>
  <div class="card"><div class="sec">Campo <span class="mut small">${esc(f)}</span></div>${pitch}</div>
  <div class="card"><div class="sec">Reservas <span class="mut small">${bench.length}</span></div>${bench.length?bench.map(p=>`<div class="pl" data-a="player" data-id="${p.id}"><div class="ovr ${tier(p.ovr)}">${p.ovr}</div><div class="info"><b>${esc(p.name)}</b><span class="mut small">${esc(p.pos)} · ${p.age} anos${p.band?' · '+esc(p.band):''} · ${money(p.value)}</span></div></div>`).join(''):'<div class="mut small">Nenhum reserva.</div>'}</div>`;
}
function vMatches(){
  const fx=[...(S.fixtures||[])].sort((a,b)=>(a.round||0)-(b.round||0)||a.id-b.id);
  const filters=[['all','Todas'],['mine','Minhas'],['pending','Pendentes'],['played','Jogadas']];
  let list=fx;
  if(matchFilter==='mine') list=fx.filter(f=>f.homeSlot===S.me.slot||f.awaySlot===S.me.slot);
  if(matchFilter==='pending') list=fx.filter(f=>f.status!=='jogado');
  if(matchFilter==='played') list=fx.filter(f=>f.status==='jogado');
  return `<div class="card"><div class="sec">Partidas</div><div class="scroll">${filters.map(([k,l])=>`<button class="chip ${matchFilter===k?'on':''}" data-a="mf" data-m="${k}">${l}</button>`).join('')}</div>
  <div class="btns">${(S.me.isOwner||S.me.slot===0)?`<button class="btn ghost sm" data-a="genFixtures">Gerar turno e returno</button>`:''}</div></div>
  <div class="card">${list.length?list.map(f=>`<div class="pl" data-a="matchSheet" data-id="${f.id}"><div class="info"><b>${esc(f.home)} ${f.status==='jogado'?(f.hs+' - '+f.as):'x'} ${esc(f.away)}</b><span class="mut small">R${f.round} ${f.leg===2?'(volta)':'(ida)'} · ${f.competition==='cup'?'Copa':f.competition==='friendly'?'Amistoso':'Liga'} · ${f.status}</span></div>${(f.status!=='jogado' && (f.homeSlot===S.me.slot||f.awaySlot===S.me.slot))?`<button class="btn sm" data-a="markGame" data-id="${f.id}">Marcar jogo</button>`:'<span class="chip">Ficha</span>'}</div>`).join(''):'<div class="mut small">Nenhuma partida. Gere o calendário.</div>'}</div>`;
}
function vMarket(){
  const open=!!S.league.marketOpen;
  const owner=S.me.isOwner||S.me.slot===0;
  const tabs=[['free','Mercado'],['teams','Times'],['offers','Propostas'+(S.pendingIn?` (${S.pendingIn})`:'' )],['auctions','Leilões']];
  let body='';
  if(mk==='free'){
    body=`${!open?'<div class="note" style="margin-bottom:10px">Mercado fechado pelo dono da liga.</div>':''}<input id="q" data-a="q" placeholder="Buscar jogador..." value="${esc(q)}"><div class="scroll mt">${posChips()}</div><div id="res" class="list-scroll"></div>`;
  } else if(mk==='teams'){
    if(teamSel!=null){
      const t=(S.teams||[]).find(x=>x.id===teamSel);
      if(!t){ teamSel=null; body='<div class="mut small">Time não encontrado.</div>'; }
      else body=`<button class="chip" data-a="teamBack">← Voltar</button><div class="row mt" style="margin:10px 0"><div class="grow"><b>${esc(t.name)}</b><div class="mut small">Téc. ${esc(t.coach||'')} · média ${t.avg||0}</div></div></div><div class="list-scroll">${(t.squad||[]).map(p=>`<div class="pl" data-a="offer" data-id="${p.id}" data-slot="${t.id}"><div class="ovr ${tier(p.ovr)}">${p.ovr}</div><div class="info"><b>${esc(p.name)}</b><span class="mut small">${esc(p.pos)} · ${p.age} anos · ${money(p.value)}</span></div><span class="chip">Propor</span></div>`).join('')||'<div class="mut small">Sem jogadores.</div>'}</div>`;
    } else {
      body=`<div class="list-scroll">${(S.teams||[]).map(t=>`<div class="pl" data-a="team" data-t="${t.id}"><div class="avatar" style="width:40px;height:40px;font-size:18px;border-radius:10px">${esc((t.name||'?')[0])}</div><div class="info"><b>${esc(t.name)}</b><span class="mut small">Téc. ${esc(t.coach||'')} · ${t.squad.length} jog. · média ${t.avg||0}</span></div><span class="chip">Ver</span></div>`).join('')||'<div class="mut small">Sem outros times.</div>'}</div>`;
    }
  } else if(mk==='offers'){
    const ins=(S.offers||[]).filter(o=>o.dir==='in');
    const outs=(S.offers||[]).filter(o=>o.dir==='out');
    const row=o=>`<div class="offer"><b>${esc(o.pn)} <span class="mut small">${esc(o.pos)} ${o.ovr}</span></b><div class="mut small">${KINDS[o.kind]||o.kind} · ${o.dir==='in'?'de':'para'} ${esc(o.tn||'')} · ${money(o.amount)}${o.sn?' · troca: '+esc(o.sn):''} · ${esc(o.status)}</div>${o.status==='pendente'?`<div class="btns">${o.dir==='in'?`<button class="btn ok sm" data-a="accIn" data-o="${o.id}">Aceitar</button><button class="btn danger sm" data-a="rejIn" data-o="${o.id}">Recusar</button>`:`<button class="btn ghost sm" data-a="canOut" data-o="${o.id}">Cancelar</button>`}</div>`:''}</div>`;
    body=`<div class="sec">Recebidas</div>${ins.length?ins.map(row).join(''):'<div class="mut small">Nenhuma.</div>'}<div class="sec mt">Enviadas</div>${outs.length?outs.map(row).join(''):'<div class="mut small">Nenhuma.</div>'}`;
  } else if(mk==='auctions'){
    body=(S.auctions||[]).length?(S.auctions||[]).map(a=>{const top=a.bids&&a.bids[0]; return `<div class="offer"><b>${esc(a.p?a.p.name:'Jogador')} <span class="mut small">${a.p?esc(a.p.pos)+' '+a.p.ovr:''}</span></b><div class="mut small">${a.status} · maior lance ${money(top?top.amount:0)}${top?' ('+esc(top.team)+')':''}</div><div class="btns">${a.status==='ativo'?`<button class="btn sm" data-a="bidSheet" data-id="${a.id}">Dar lance</button>${(S.me.isOwner||S.me.slot===0)?`<button class="btn ghost sm" data-a="closeAuction" data-id="${a.id}">Encerrar</button>`:''}`:''}</div></div>`;}).join(''):'<div class="mut small">Nenhum leilão.</div>';
  }
  const toggle=owner?`<div class="btns" style="margin-top:10px"><button class="btn ${open?'danger':'ok'} sm" data-a="toggleMarket">${open?'Fechar mercado':'Abrir mercado'}</button></div>`:'';
  return `<div class="card"><div class="row" style="justify-content:space-between"><div><div class="sec">Mercado de transferências</div><div class="mut small">${open?'Aberto — jogadores sem time podem ser contratados.':'Fechado — compras, vendas, propostas e leilões bloqueados.'}</div></div><span class="tag ${open?'on':''}">${open?'ABERTO':'FECHADO'}</span></div>${toggle}<div class="scroll mt">${tabs.map(([k,l])=>`<button class="chip ${mk===k?'on':''}" data-a="mk" data-m="${k}">${l}</button>`).join('')}</div></div><div class="card">${body}</div>`;
}
function vMoney(){
  const pay=payroll();
  const deals=(S.sponsors&&S.sponsors.deals)||[];
  return `<div class="card"><div class="lbl">Saldo</div><div class="big">${money(S.me.balance)}</div><div class="mut small mt">Folha salarial: ${money(pay)}</div></div>
  <div class="card"><div class="sec">Patrocínios</div>${deals.length?deals.map(d=>`<div class="sponsor"><b>${esc(d.name||d.sponsor_id||'Patrocínio')}</b><div class="mut small">${esc(d.status||'ativo')} · ${money(d.reward||0)}</div></div>`).join(''):'<div class="mut small">Nenhum patrocínio.</div>'}<div class="btns"><button class="btn ghost sm" data-a="sponsorSheet">Escolher patrocinador</button></div></div>
  <div class="card"><div class="sec">Extrato</div>${(S.tx||[]).length?(S.tx||[]).map(t=>`<div class="pl" style="cursor:default;padding:8px 0"><div class="info"><b style="font-size:14px">${esc(t.t)}</b><span class="mut small">${t.d?new Date(t.d).toLocaleString('pt-BR'):''}</span></div><b class="${t.v>=0?'pos':'neg'}">${t.v>=0?'+':''}${money(t.v)}</b></div>`).join(''):'<div class="mut small">Sem movimentações.</div>'}</div>`;
}
function vLeague(){
  const meRow=(S.table||[]).find(r=>r.id===S.me.slot);
  return `<div class="card"><div class="sec">${esc(S.league.name)}</div><div class="mut small">${esc(S.league.gameName)} · Temporada ${S.league.season} · Rodada ${S.league.round} · Convite <b>${esc(S.league.invite)}</b></div>
  ${meRow?`<div class="note mt">Seu time: <b>${esc(meRow.name||meRow.team||'Time')}${meRow.coach?` (${esc(meRow.coach)})`:''}</b></div>`:''}
  <div class="btns"><button class="btn ghost sm" data-a="copyInvite">Copiar convite</button>${(S.me.isOwner||S.me.slot===0)?'<button class="btn ghost sm" data-a="ownerSheet">Configurações</button>':''}</div></div>
  <div class="card"><div class="sec">Classificação</div>${tableHTML(standings())}</div>
  <div class="card"><div class="sec">Times <span class="mut small">${(S.teams||[]).length+1}</span></div><div class="pl" style="cursor:default"><div class="info"><b>${esc(S.me.team||'Meu Time')}${S.me.club?' · '+esc(S.me.club.name):''}</b><span class="mut small">Téc. ${esc(S.me.coach||'')} (você)</span></div><span class="tag on">VOCÊ</span></div>${(S.teams||[]).map(t=>`<div class="pl" style="cursor:default"><div class="info"><b>${esc(t.name)}${t.club?' · '+esc(t.club.name):''}</b><span class="mut small">Téc. ${esc(t.coach||'')} · média ${t.avg||0}</span></div></div>`).join('')}</div>`;
}


function render(){
  if(!S||screen!=='app'){
    $('#chip').innerHTML=screen==='leagues'?'<button class="chip" data-a="logout">Sair</button>':'';
    $('#sub').textContent=screen==='leagues'?'Escolha uma liga ou crie a sua':'Gerenciador de liga de futebol';
    $('#nav').innerHTML='';
    $('#view').innerHTML=screen==='auth'?vAuth():vLeaguesScreen();
    return;
  }
  const pi=S.pendingIn||0;
  $('#chip').innerHTML=`${unread()?`<button class="chip" data-a="notifs">Avisos<span class="cb">${unread()}</span></button>`:''}<button class="chip" data-a="profile">Perfil e liga</button>`;
  $('#sub').textContent=`${S.league.name} · ${S.league.gameName} · Temporada ${S.league.season} · Rodada ${S.league.round}/${S.league.rounds}`;
  $('#nav').innerHTML=(S.draft||S.league.phase==='brand')?'':TABS.map(([k,l])=>`<button class="${k===tab?'on':''}" data-a="tab" data-t="${k}"><svg viewBox="0 0 24 24">${ICON[k]}</svg>${l}${k==='market'&&pi?`<span class="badge">${pi}</span>`:''}</button>`).join('');
  const VIEWS={home:vHome,squad:vSquad,matches:vMatches,market:vMarket,money:vMoney,league:vLeague};
  $('#view').innerHTML=S.league.phase==='brand'?vBrands():S.draft?vDraft():(VIEWS[tab]||vHome)();
  if($('#res') && !(S && S.draft))searchPlayers();
}
async function searchPlayers(){
  const box=$('#res');if(!box||!leagueId)return;
  try{
    const d=await api(`/leagues/${leagueId}/players?q=${encodeURIComponent(q)}&pos=${encodeURIComponent(qp)}`);
    lastPlayers=d.players||[];
    const draft=!!(S&&S.draft);
    const rows=lastPlayers.map(p=>{
      const own=p.owner==='me'?['on','SEU TIME']:p.owner==='team'?['warn',(p.ownerTeam||'TIME').toUpperCase()]:p.owner==='free'?['','LIVRE']:['','BASE'];
      return `<div class="pl" data-a="basePlayer" data-id="${p.i}">${faceBox(p,38)}<div class="info"><b>${esc(p.n)} (${p.o})</b><span class="mut small">${esc(p.ps||p.p)} · ${esc(p.c||'Sem clube')} · ${esc(p.nt)}</span></div><div style="text-align:right"><span class="tag ${own[0]}">${own[1]}</span><div class="mut small">${p.a} anos</div></div></div>`;
    }).join('');
    box.innerHTML=`<div class="mut small" style="margin:10px 0 4px">${nf(d.total)} jogador${d.total===1?'':'s'}</div>`+(rows||'<div class="mut">Nenhum jogador encontrado.</div>');
  }catch(e){box.innerHTML='<div class="mut small">Não foi possível carregar os jogadores.</div>'}
}
function playerSheet(id){
  const p=S.squad.find(x=>x.id===id);if(!p)return;
  const idx=S.lineup.indexOf(p.id),v=Math.round(p.value*0.8);
  openSheet(`<div class="row">${faceBox(p,54)}<div class="grow"><h2 style="font-size:24px">${esc(p.name)} (${p.ovr})</h2><div class="mut small">${p.pos} · ${p.age} anos${p.club?' · '+esc(p.club):''} · ${idx>=0?'Titular':'Reserva'}</div></div>${face(p)}</div>
  <div class="stats"><div><b>${short(p.value)}</b><span>Valor</span></div><div><b>${short(p.salary)}</b><span>Salário</span></div><div><b>${p.goals}/${p.assists}</b><span>Gols/Assist.</span></div></div>
  <div class="mut small">${esc(p.nat||'')}${p.status?' · '+esc(p.status):''}</div>
  <div class="btns">${idx>=0?`<button class="btn ghost" data-a="positionSheet" data-id="${p.id}">Definir posição</button><button class="btn ghost" data-a="bench" data-id="${p.id}">Tirar do campo</button>`:`<button class="btn" data-a="field" data-id="${p.id}">Escalar</button><button class="btn ghost" data-a="positionSheet" data-id="${p.id}">Escalar em posição</button>`}<button class="btn danger" data-a="sell" data-id="${p.id}">Vender por ${short(v)}</button><button class="btn ghost" data-a="offerMine">Propor a outro time</button></div>`);
}
function pickSheet(i){
  const f=FORMS[S.me.formation]||FORMS['4-3-3'],pos=f[i]?f[i][0]:'jogador';
  const cands=[...S.squad].filter(p=>S.lineup[i]!==p.id).sort((a,b)=>(b.pos===pos)-(a.pos===pos)||b.ovr-a.ovr);
  openSheet(`<h2 style="font-size:22px;margin-bottom:6px">Escolher ${pos}</h2><div class="mut small" style="margin-bottom:6px">Toque no jogador para colocá-lo nessa posição.</div>`+
    cands.map(p=>`<div class="pl" data-a="set" data-i="${i}" data-id="${p.id}">${faceBox(p,38)}<div class="info"><b>${esc(p.name)} (${p.ovr})</b><span class="mut small">${p.pos}${S.lineup.includes(p.id)?' · já no campo':''}</span></div>${p.pos===pos?'<span class="tag on">POSIÇÃO</span>':''}</div>`).join(''));
}
function positionSheet(id){
  const p=S.squad.find(x=>x.id===id);if(!p)return;
  const f=FORMS[S.me.formation]||FORMS['4-3-3'];
  const ok=POSOK[p.pos]||[p.pos];
  openSheet(`<h2 style="font-size:22px;margin-bottom:6px">Posição de ${esc(p.name)}</h2><div class="mut small" style="margin-bottom:8px">Jogador de ${esc(p.pos)} · toque na posição desejada.</div>
  <div class="list-scroll">${f.map((slot,i)=>{
    const cur=S.lineup[i],occ=cur?S.squad.find(x=>x.id===cur):null;
    return `<div class="pl" data-a="set" data-i="${i}" data-id="${p.id}"><span class="tag ${ok.includes(slot[0])?'on':''}">${slot[0]}</span><div class="info"><b style="font-size:14px">${esc(slot[0])}</b><span class="mut small">${occ?'Ocupada por '+esc(occ.name):'Livre'}</span></div>${S.lineup[i]===p.id?'<span class="tag on">AQUI</span>':''}</div>`;
  }).join('')}</div>`);
}
function offerSheet(pid,slot){
  const t=(S.teams||[]).find(x=>x.id===slot),p=t&&t.squad.find(x=>x.id===pid);if(!p)return;
  openSheet(`<div class="row">${faceBox(p,54)}<div class="grow"><h2 style="font-size:22px">${esc(p.name)} (${p.ovr})</h2><div class="mut small">${p.pos} · ${p.age} anos · ${esc(t.name)}</div></div>${face(p)}</div>
  <div class="stats"><div><b>${short(p.value)}</b><span>Valor</span></div><div><b>${short(S.me.balance)}</b><span>Seu saldo</span></div><div><b>${p.ovr}</b><span>Overall</span></div></div>
  <label>Tipo de proposta</label><select id="o-kind"><option value="transfer">Transferência</option><option value="buyout">Multa (mín. ${nf(Math.round(p.value*1.3))})</option><option value="loan">Empréstimo</option><option value="precontract">Pré-contrato</option></select>
  <label>Valor da proposta (C$)</label><input id="o-amt" inputmode="numeric" value="${p.value}">
  <label>Rodadas de empréstimo</label><input id="o-loan" inputmode="numeric" value="5">
  <label>Oferecer jogador seu na troca (opcional)</label><select id="o-swap"><option value="">Só dinheiro</option>${[...S.squad].sort((a,b)=>b.ovr-a.ovr).map(x=>`<option value="${x.id}">${x.ovr} · ${esc(x.name)} (${x.pos}) · ${short(x.value)}</option>`).join('')}</select>
  <div class="btns"><button class="btn" data-a="sendOffer" data-id="${p.id}" data-slot="${slot}">Enviar proposta</button><button class="btn ghost" data-a="close">Cancelar</button></div>`);
}
function auctionSheet(id){
  const p=S.market.find(x=>x.id===id);if(!p)return;
  openSheet(`<h2 style="font-size:22px">Leilão de ${esc(p.name)}</h2><div class="mut small">${p.pos} · ${p.ovr} overall · valor ${money(p.value)}</div>
  <label>Duração em minutos</label><input id="au-min" inputmode="numeric" value="30">
  <div class="btns"><button class="btn" data-a="newAuction" data-id="${id}">Abrir leilão</button><button class="btn ghost" data-a="close">Cancelar</button></div>`);
}
function bidSheet(id){
  const a=(S.auctions||[]).find(x=>x.id===id);if(!a)return;
  openSheet(`<h2 style="font-size:22px">Dar lance</h2><div class="mut small">${esc(a.p?a.p.name:'Jogador')} · maior lance ${money(a.bids&&a.bids.length?a.bids[0].amount:0)} · seu saldo ${money(S.me.balance)}</div>
  <label>Seu lance (C$)</label><input id="b-amt" inputmode="numeric" value="${(a.bids&&a.bids.length?a.bids[0].amount:0)+100000}">
  <div class="btns"><button class="btn" data-a="bid" data-id="${id}">Enviar lance</button><button class="btn ghost" data-a="close">Cancelar</button></div>`);
}
function brandBidSheet(id){
  const b=S.brands||{},c=(b.options||[]).find(x=>String(x.id)===String(id));if(!c)return;
  openSheet(`<div class="row">${crestSVG(c,64)}${kitSVG(c,64)}<div class="grow"><h2 style="font-size:22px">${esc(c.name)}</h2><div class="mut small">${esc(c.country)} · média ${c.strength}</div><div class="mut small">Escudo, nome e uniforme</div></div></div>
  <div class="note mt">Escolha sem custo. Depois, reproduza o elenco deste clube no jogo.</div>
  <div class="btns"><button class="btn" data-a="brandBid" data-id="${esc(c.id)}">Escolher clube</button><button class="btn ghost" data-a="close">Cancelar</button></div>`);
}
function sponsorSheet(){
  const cat=(S.sponsors&&S.sponsors.catalog)||[];
  openSheet(`<h2 style="font-size:22px">Escolher patrocinador</h2><div class="mut small">Cada clube escolhe um patrocinador; metas completadas pagam o valor acordado.</div>
  <div class="mt">${cat.map(s=>`<div class="pl" style="cursor:default"><div class="info"><b>${esc(s.name)}</b><span class="mut small">${esc(s.category)} · ${esc(s.goal)} · ${money(s.reward)}</span></div><button class="btn sm" data-a="sponsorPick" data-id="${esc(s.id)}">Assinar</button></div>`).join('')||'<div class="mut small">Nenhum patrocinador disponível.</div>'}</div>
  <div class="btns"><button class="btn ghost" data-a="close">Fechar</button></div>`);
}
function baseSheet(id,draftMode){
  const p=lastPlayers.find(x=>x.i===id);if(!p)return;
  const own=p.owner==='me'?'SEU TIME':p.owner==='team'?'TIME '+String(p.ownerTeam||'').toUpperCase():p.owner==='free'?'LIVRE':'DISPONÍVEL NA BASE';
  const buyBtn=(!draftMode&&p.owner==='free'&&S.league&&S.league.marketOpen)?`<button class="btn" data-a="buy" data-id="${p.cpId||p.i}">Contratar por ${money(p.v)}</button>`:'';
  const draftBtn=(draftMode&&S.draft&&S.draft.myTurn)?`<button class="btn" data-a="dpick" data-id="${p.i}">Escolher no draft</button>`:'';
  openSheet(`<div class="row">${faceBox(p,54)}<div class="grow"><h2 style="font-size:22px">${esc(p.n)} (${p.o})</h2><div class="mut small">${esc(p.ps||p.p)} · ${p.a} anos · ${esc(p.c||'Sem clube')}</div></div>${face(p)}</div>
  <div class="stats"><div><b>${p.t}</b><span>Potencial</span></div><div><b>${short(p.v)}</b><span>Valor</span></div><div><b>${short(p.w)}</b><span>Salário</span></div></div>
  <div class="mut small">${esc(p.nt)}${p.l?' · '+esc(p.l):''}</div><div class="note mt">${esc(own)}</div>
  <div class="btns">${draftBtn}${buyBtn}<button class="btn ghost" data-a="close">Voltar</button></div>`);
}function friendlySheet(){
  openSheet(`<h2 style="font-size:22px">Desafiar um time</h2><div class="mut small">Escolha o adversário para um amistoso. Times humanos recebem um convite.</div>
  ${(S.teams||[]).map(t=>`<div class="pl" data-a="friendlyAsk" data-t="${t.id}"><div class="avatar" style="width:40px;height:40px;font-size:18px;border-radius:10px">${esc((t.name||'?')[0])}</div><div class="info"><b>${esc(t.name)}</b><span class="mut small">Téc. ${esc(t.coach)} · média ${t.avg}</span></div><span class="chip">Desafiar</span></div>`).join('')}
  <div class="btns"><button class="btn ghost" data-a="close">Fechar</button></div>`);
}
function notifsSheet(){
  openSheet(`<h2 style="font-size:22px">Notificações</h2>
  ${(S.notifications||[]).map(n=>`<div class="offer"><b style="font-size:14px">${esc(n.text)}</b><div class="mut small">${new Date(n.d).toLocaleString('pt-BR')}${n.read?'':' · nova'}</div></div>`).join('')||'<div class="mut small">Nenhuma notificação.</div>'}
  <div class="btns"><button class="btn" data-a="readNotifs">Marcar como lidas</button><button class="btn ghost" data-a="close">Fechar</button></div>`);
}
function profileSheet(){
  const p=getProfile();
  openSheet(`<h2 style="font-size:22px">Perfil do técnico</h2>
  <label>Nome do time</label><input id="f-team" value="${esc(p.team)}" maxlength="24">
  <label>Seu nome</label><input id="f-coach" value="${esc(p.coach||S.me.coach)}" maxlength="30">
  <label>ID no jogo (EA / PSN / Xbox / Konami)</label><input id="f-gid" value="${esc(p.gid)}" maxlength="30">
  <label>WhatsApp</label><input id="f-phone" value="${esc(p.phone)}" inputmode="tel" maxlength="20">
  <div class="btns"><button class="btn" data-a="saveProfile">Salvar</button><button class="btn ghost" data-a="close">Cancelar</button></div>
  <h2 style="font-size:20px;margin-top:22px">Liga</h2>
  <div class="mut small" style="margin:4px 0 8px">${esc(S.league.name)} · ${esc(S.league.gameName)} · convite <b>${esc(S.league.invite)}</b></div>
  <div class="btns"><button class="btn ghost sm" data-a="copyInvite">Copiar convite</button>${S.me.isOwner?'<button class="btn ghost sm" data-a="ownerSheet">Configurações da liga</button>':''}<button class="btn ghost sm" data-a="backLeagues">Trocar de liga</button><button class="btn danger sm" data-a="logout">Sair da conta</button></div>
  <div class="note mt">Só o dono da liga pode trocar o jogo, o modo e as rodadas.</div>`);
}
function ownerSheet(){
  openSheet(`<h2 style="font-size:22px">Configurações da liga</h2>
  <label>Nome da liga</label><input id="s-name" value="${esc(S.league.name)}" maxlength="40">
  <label>Jogo</label><select id="s-game">${gameOptions(S.league.game)}</select>
  <label>Modo de início</label><select id="s-mode"><option value="draft" ${S.league.startMode==='draft'?'selected':''}>Draft</option><option value="random" ${S.league.startMode==='random'?'selected':''}>Sorteio automático</option></select>
  <label>Rodadas</label><select id="s-rounds">${roundOptions(S.league.rounds)}</select>
  <div class="note">Só o dono da liga vê estas opções. Trocar o jogo exige reiniciar a liga; elencos, saldos e propostas serão apagados.</div>
  <div class="btns"><button class="btn" data-a="saveSettings">Salvar</button><button class="btn danger" data-a="resetSheet">Reiniciar liga</button><button class="btn ghost" data-a="close">Fechar</button></div>
  <div class="btns"><button class="btn ghost" data-a="copyInvite">Copiar convite: ${esc(S.league.invite)}</button></div>
  <div class="btns"><button class="btn danger" data-a="deleteLeagueSheet">Excluir liga</button></div>`);
}
function resetSheet(){
  openSheet(`<h2 style="font-size:22px">Reiniciar liga?</h2><div class="mut">Elencos, saldos, propostas e resultados serão apagados. Esta ação não pode ser desfeita.</div>
  <label>Jogo</label><select id="r-game">${gameOptions(S.league.game)}</select>
  <label>Modo de início</label><select id="r-mode"><option value="draft" ${S.league.startMode==='draft'?'selected':''}>Draft</option><option value="random" ${S.league.startMode==='random'?'selected':''}>Sorteio automático</option></select>
  <label>Rodadas</label><select id="r-rounds">${roundOptions(S.league.rounds)}</select>
  <div class="btns"><button class="btn danger" data-a="resetConfirm">Confirmar reinício</button><button class="btn ghost" data-a="close">Cancelar</button></div>`);
}
document.addEventListener('click',async e=>{
  const el=e.target.closest('[data-a]');if(!el)return;
  const a=el.dataset.a,d=el.dataset;
  try{
    if(a==='close'){closeSheet();return}
    if(a==='authMode'){authMode=authMode==='login'?'register':'login';render();return}
        if(a==='authGo'){
      const body=authMode==='register'?{email:$("#a-email").value,password:$("#a-pass").value,name:$("#a-name").value}:{email:$("#a-email").value,password:$("#a-pass").value};
      const r=await api('/auth/'+(authMode==='register'?'register':'login'),{method:'POST',body:JSON.stringify(body)});
      if(r.needsVerify){ toast(r.message||'Verifique seu e-mail.'); if(r.devVerifyLink) console.log('devVerifyLink',r.devVerifyLink); authMode='login'; render(); return; }
      me=r.user;token=r.token;localStorage.setItem(TK,token);
      await screenLeagues();
      return;
    }
    if(a==='resendVerify'){
      const email=$("#a-email")?.value||'';
      const r=await api('/auth/resend-verify',{method:'POST',body:JSON.stringify({email})});
      return;
    }
    if(a==='logout'){
      try{await api('/auth/logout',{method:'POST'})}catch(_){}
      token='';localStorage.removeItem(TK);me=null;S=null;leagueId='';localStorage.removeItem(LK);screen='auth';closeSheet();render();return;
    }
    if(a==='openLeague'){screen='app';leagueId=String(d.id);localStorage.setItem(LK,leagueId);tab='home';mk='free';teamSel=null;q='';qp='';brandQ='';await loadState(d.id);startEvents();return}
    if(a==='createLeague'){
      const pr=getProfile();
      const team=$('#c-team').value||pr.team||'Meu Time FC';
      const coach=$('#c-coach').value||pr.coach||(me&&me.name)||'Técnico';
      const phone=($('#c-phone')?$('#c-phone').value:(pr.phone||'')).trim();
      localStorage.setItem(PK,JSON.stringify({...pr,team,coach,phone}));
      const body={name:$('#c-name').value||'Minha Liga',game:$('#c-game').value,startMode:$('#c-mode').value,rounds:+$('#c-rounds').value,team,coach,phone};
      const r=await api('/leagues',{method:'POST',body:JSON.stringify(body)});
      S=r.state;leagueId=String(r.id);localStorage.setItem(LK,leagueId);screen='app';tab='home';mk='free';brandQ='';render();startEvents();toast('Liga criada!');return;
    }
    if(a==='joinLeague'){
      const pr=getProfile();
      const team=$('#j-team').value||pr.team||'Meu Time';
      const coach=$('#j-coach').value||pr.coach||(me&&me.name)||'Técnico';
      const phone=($('#j-phone')?$('#j-phone').value:(pr.phone||'')).trim();
      localStorage.setItem(PK,JSON.stringify({...pr,team,coach,phone}));
      const r=await api('/leagues/join',{method:'POST',body:JSON.stringify({invite:$('#j-invite').value,team,coach,phone})});
      S=r.state;leagueId=String(r.id);localStorage.setItem(LK,leagueId);screen='app';tab='home';mk='free';brandQ='';render();startEvents();toast('Você entrou na liga!');return;
    }
    if(a==='backLeagues'){closeSheet();await screenLeagues();return}
    if(a==='tab'){tab=d.t;teamSel=null;render();scrollTo(0,0);return}
    if(a==='mf'){matchFilter=d.m;render();return}
    if(a==='genFixtures'){await api('/leagues/'+leagueId+'/fixtures/generate',{method:'POST'});toast('Turno e returno gerados');return}
    if(a==='matchSheet'){matchSheet(+d.id);return}
    if(a==='markGame'){markFixture(+d.id);return}
    if(a==='saveReport'){
      if(!reportDraft)return;
      const fx=(S.fixtures||[]).find(f=>f.id===reportDraft.id);
      const events={goals:parseEventLines($('#mr-goals')?$('#mr-goals').value:'','goals',reportDraft),cards:parseEventLines($('#mr-cards')?$('#mr-cards').value:'','cards',reportDraft),injuries:parseEventLines($('#mr-injuries')?$('#mr-injuries').value:'','injuries',reportDraft)};
      const body={events,photo:reportDraft.photo,note:($('#mr-note')?$('#mr-note').value:'')};
      if(fx&&fx.status!=='jogado'){ const hs=$('#mr-hs')?$('#mr-hs').value:''; const as=$('#mr-as')?$('#mr-as').value:''; if(hs===''||as==='') return toast('Informe o placar (gols casa e fora)'); body.homeScore=+hs; body.awayScore=+as; }
      const r=await api('/leagues/'+leagueId+'/fixtures/'+reportDraft.id+'/report',{method:'POST',body:JSON.stringify(body)});
      S=r.state;closeSheet();render();toast('Resultado salvo');return;
    }
    if(a==='gotoOffers'){tab='market';mk='offers';render();scrollTo(0,0);return}
    if(a==='mk'){mk=d.m;teamSel=null;render();return}
    if(a==='team'){teamSel=+d.t;render();scrollTo(0,0);return}
    if(a==='teamBack'){teamSel=null;render();return}
    if(a==='qpos'){qp=d.p;render();return}
    if(a==='form'){await api('/leagues/'+leagueId+'/formation',{method:'POST',body:JSON.stringify({formation:d.f})});toast('Formação: '+d.f);return}
    if(a==='autoLineup'){await api('/leagues/'+leagueId+'/lineup/auto',{method:'POST'});toast('Escalação automática atualizada');return}
    if(a==='player'){playerSheet(+d.id);return}
    if(a==='pick'){pickSheet(+d.i);return}
    if(a==='positionSheet'){positionSheet(+d.id);return}
    if(a==='field'||a==='set'){
      const sl=[...S.lineup],id=+d.id,old=sl.indexOf(id);if(old>=0)sl[old]=null;
      let i=a==='set'?+d.i:-1;
      if(i<0){
        const p=S.squad.find(x=>x.id===id),f=FORMS[S.me.formation]||FORMS['4-3-3'],ok=POSOK[p&&p.pos]||[p&&p.pos];
        i=sl.findIndex((x,k)=>!x&&f[k]&&f[k][0]===p.pos);
        if(i<0)i=sl.findIndex((x,k)=>!x&&f[k]&&ok.includes(f[k][0]));
        if(i<0)i=sl.indexOf(null);
        if(i<0)i=old>=0?old:0;
      }
      sl[i]=id;
      await api('/leagues/'+leagueId+'/lineup',{method:'POST',body:JSON.stringify({slots:sl})});closeSheet();toast('Escalação atualizada');return;
    }
    if(a==='bench'){const sl=[...S.lineup].map(x=>x===+d.id?null:x);await api('/leagues/'+leagueId+'/lineup',{method:'POST',body:JSON.stringify({slots:sl})});closeSheet();return}
    if(a==='sell'){await api('/leagues/'+leagueId+'/sell',{method:'POST',body:JSON.stringify({playerId:+d.id})});closeSheet();toast('Jogador vendido');return}
    if(a==='buy'){await api('/leagues/'+leagueId+'/buy',{method:'POST',body:JSON.stringify({playerId:+d.id})});closeSheet();toast('Jogador contratado!');return}
    if(a==='toggleMarket'){await api('/leagues/'+leagueId+'/market/toggle',{method:'POST'});toast(S&&S.league.marketOpen?'Mercado aberto':'Mercado fechado');return}
    if(a==='offerMine'){tab='market';mk='teams';teamSel=null;closeSheet();render();toast('Escolha um time para propor');return}
    if(a==='offer'){offerSheet(+d.id,+d.slot);return}
    if(a==='sendOffer'){
      const kind=$('#o-kind').value,amount=Math.max(0,Math.round(+($('#o-amt').value.replace(/\D/g,'')||0))),swapId=$('#o-swap').value||null;
      await api('/leagues/'+leagueId+'/offers',{method:'POST',body:JSON.stringify({toSlot:+d.slot,playerId:+d.id,kind,amount,swapId,loanRounds:+$('#o-loan').value||5})});
      closeSheet();mk='offers';render();toast('Proposta enviada');return;
    }
    if(a==='accIn'||a==='rejIn'){await api('/leagues/'+leagueId+'/offers/'+d.o+'/respond',{method:'POST',body:JSON.stringify({accept:a==='accIn'})});toast(a==='accIn'?'Proposta aceita':'Proposta recusada');return}
    if(a==='canOut'){await api('/leagues/'+leagueId+'/offers/'+d.o+'/cancel',{method:'POST'});toast('Proposta cancelada');return}
    if(a==='auctionSheet'){auctionSheet(+d.id);return}
    if(a==='newAuction'){await api('/leagues/'+leagueId+'/auctions',{method:'POST',body:JSON.stringify({playerId:+d.id,minutes:+$('#au-min').value||30})});closeSheet();toast('Leilão aberto');return}
    if(a==='bidSheet'){bidSheet(+d.id);return}
    if(a==='bid'){const amount=Math.round(Number(String($('#b-amt').value||'').replace(/[^\d-]/g,'')));if(!Number.isFinite(amount)||amount<=0)return toast('Lance inválido');await api('/leagues/'+leagueId+'/auctions/'+d.id+'/bid',{method:'POST',body:JSON.stringify({amount})});closeSheet();toast('Lance enviado');return}
    if(a==='closeAuction'){await api('/leagues/'+leagueId+'/auctions/'+d.id+'/close',{method:'POST'});toast('Leilão encerrado');return}
    if(a==='dplayer'||a==='basePlayer'){baseSheet(+d.id,a==='dplayer');return}
    if(a==='droll'){await api('/leagues/'+leagueId+'/draft/roll',{method:'POST',body:JSON.stringify({pos:d.pos})});return}
    if(a==='dpickOpt'){await api('/leagues/'+leagueId+'/draft/pick',{method:'POST',body:JSON.stringify({baseId:+d.id})});if(S&&!S.draft){tab='home';toast('Draft concluído! Boa liga');}return}
    if(a==='dauto'){await api('/leagues/'+leagueId+'/draft/auto',{method:'POST'});if(S&&!S.draft){tab='home';toast('Draft concluído! Boa liga');}render();return}
    if(a==='brandBidSheet'){brandBidSheet(d.id);return}
    if(a==='brandBid'){await api('/leagues/'+leagueId+'/brands/bid',{method:'POST',body:JSON.stringify({clubId:+d.id})});closeSheet();render();toast('Clube selecionado!');return}
    if(a==='brandClose'){
      if(!confirm('Confirmar os clubes e iniciar a liga?'))return;
      await api('/leagues/'+leagueId+'/brands/close',{method:'POST'});
      tab='home';closeSheet();render();toast('Clubes definidos!');return;
    }
    if(a==='sponsorSheet'){sponsorSheet();return}
    if(a==='sponsorPick'){await api('/leagues/'+leagueId+'/sponsors',{method:'POST',body:JSON.stringify({sponsorId:d.id})});closeSheet();toast('Patrocínio assinado!');return}
    if(a==='profile'){profileSheet();return}
    if(a==='saveProfile'){
      const p={team:($('#f-team')?$('#f-team').value:'').trim()||'Meu Time FC',coach:(($('#f-coach')?$('#f-coach').value:'').trim()||'Técnico'),gid:($('#f-gid')?$('#f-gid').value:'').trim(),phone:($('#f-phone')?$('#f-phone').value:'').trim()};
      localStorage.setItem(PK,JSON.stringify({...getProfile(),...p}));
      if(leagueId){ try{ const r=await api('/leagues/'+leagueId+'/profile',{method:'POST',body:JSON.stringify({team:p.team,coach:p.coach,phone:p.phone})}); if(r&&r.state) S=r.state; }catch(_){} }
      closeSheet();render();toast('Perfil salvo');return;
    }
    if(a==='notifs'){notifsSheet();return}
    if(a==='readNotifs'){await api('/leagues/'+leagueId+'/notifications/read',{method:'POST'});await api('/leagues/'+leagueId);closeSheet();toast('Notificações marcadas como lidas');return}
    if(a==='ownerSheet'){closeSheet();tab='league';render();ownerSheet();return}
    if(a==='saveSettings'){
      await api('/leagues/'+leagueId+'/settings',{method:'PATCH',body:JSON.stringify({name:$('#s-name').value||S.league.name,rounds:+$('#s-rounds').value,startMode:$('#s-mode').value})});
      closeSheet();toast('Configurações salvas');return;
    }
    if(a==='resetSheet'){resetSheet();return}
    if(a==='deleteLeagueSheet'){
      openSheet(`<h2 style="font-size:22px">Excluir ${esc(S.league.name)}?</h2><div class="mut">Todos os times, jogadores, resultados e mensagens desta liga serão apagados. Você é o dono e esta ação não pode ser desfeita.</div>
      <div class="btns"><button class="btn danger" data-a="deleteLeague">Excluir permanentemente</button><button class="btn ghost" data-a="close">Cancelar</button></div>`);return;
    }
    if(a==='deleteLeague'){
      const r=await api('/leagues/'+leagueId,{method:'DELETE'});
      localStorage.removeItem(LK);leagueId='';S=null;closeSheet();await screenLeagues();toast('Liga "'+r.name+'" excluída');return;
    }
    if(a==='deleteLeagueFromList'){
      if(!confirm('Excluir a liga "'+(d.name||'')+'"? Esta ação não pode ser desfeita.'))return;
      const r=await api('/leagues/'+d.id,{method:'DELETE'});
      if(String(leagueId)===String(d.id)){leagueId='';localStorage.removeItem(LK);S=null}
      await screenLeagues();toast('Liga "'+r.name+'" excluída');return;
    }
    if(a==='resetConfirm'){
      await api('/leagues/'+leagueId+'/reset',{method:'POST',body:JSON.stringify({game:$('#r-game').value,startMode:$('#r-mode').value,rounds:+$('#r-rounds').value})});
      closeSheet();tab='home';render();toast('Liga reiniciada');return;
    }
    if(a==='copyInvite'){
      try{await navigator.clipboard.writeText(S.league.invite);toast('Convite copiado: '+S.league.invite)}catch(_){toast('Convite: '+S.league.invite)}
      return;
    }
  }catch(err){toast(err&&err.message?err.message:'Erro inesperado')}
});
document.addEventListener('input',e=>{
  if(!e.target||!e.target.dataset)return;
  if(e.target.dataset.a==='q'){q=e.target.value;clearTimeout(qt);qt=setTimeout(searchPlayers,260)}
  if(e.target.dataset.a==='brandq'){
    brandQ=e.target.value;render();
    const el=$('[data-a="brandq"]');
    if(el){el.focus();el.setSelectionRange(el.value.length,el.value.length)}
  }
});
document.addEventListener('change',e=>{
  if(!e.target||e.target.id!=='mr-photo')return;
  const file=e.target.files&&e.target.files[0];if(!file)return;
  if(file.size>2*1024*1024){toast('Use uma imagem de até 2 MB');e.target.value='';return}
  const rd=new FileReader();
  rd.onload=()=>{
    if(!reportDraft)return;
    reportDraft.events={goals:parseEventLines($('#mr-goals').value,'goals',reportDraft),cards:parseEventLines($('#mr-cards').value,'cards',reportDraft),injuries:parseEventLines($('#mr-injuries').value,'injuries',reportDraft)};
    const note=$('#mr-note')?$('#mr-note').value:'';
    reportDraft.photo=String(rd.result||'');
    matchSheet(reportDraft.id,true);
    if($('#mr-note'))$('#mr-note').value=note;
  };
  rd.readAsDataURL(file);
});
document.addEventListener('keydown',e=>{if(e.key==='Enter'&&screen==='auth'&&e.target.tagName==='INPUT'){const b=$('[data-a="authGo"]');if(b)b.click()}});
setInterval(()=>{try{if(screen==='app'&&S&&!S.draft&&tab==='market'&&mk==='offers'&&leagueId)api('/leagues/'+leagueId).catch(()=>{})}catch(_){}},8000);
(async function boot(){
  render();
  try{
    const m=await api('/me');me=m.user;
    if(leagueId){try{screen='app';await loadState(leagueId)}catch(e){leagueId='';localStorage.removeItem(LK);await screenLeagues()}}
    else await screenLeagues();
    startEvents();
  }catch(e){screen='auth';render()}
})();

if('serviceWorker' in navigator){
  window.addEventListener('load',()=>{
    navigator.serviceWorker.register('/sw.js').catch(()=>{});
  });
}
