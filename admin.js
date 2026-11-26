const c=window.JS_ADMIN_CONFIG;
const sb=supabase.createClient(c.supabaseUrl,c.supabasePublishableKey);
let token='';
let rows={profiles:[],devices:[],activity:[]};
let filter='all',query='',sortBy='new';
const $=id=>document.getElementById(id);
const ERROR_RE=/fail|error|enter |invalid|required|denied|unknown|could not|not found|missing/i;
const OK_RE=/^(loaded|signed in|you have)/i;
const msg=t=>{const el=$('msg');el.textContent=t;const s=ERROR_RE.test(t)?'error':OK_RE.test(t)?'success':'idle';if(el.dataset.state!==s){el.dataset.state=s;el.classList.remove('pop');void el.offsetWidth;el.classList.add('pop');}};
const setBusy=(el,busy,label)=>{el.disabled=busy;const s=el.querySelector('span');if(s)s.textContent=busy?'Signing in…':label;};
function showAdmin(){$('login').hidden=true;$('adminArea').hidden=false;$('signOut').hidden=false;$('refresh').hidden=false;}
function showLogin(){$('login').hidden=false;$('adminArea').hidden=true;$('signOut').hidden=true;$('refresh').hidden=true;$('users').innerHTML='';token='';rows={profiles:[],devices:[],activity:[]};}
function pill(value,kind){const s=document.createElement('span');s.className='pill '+kind;s.textContent=value;return s;}
function btn(label,klass,fn){const b=document.createElement('button');b.type='button';b.className='btn btn-sm '+klass;b.textContent=label;b.onclick=()=>fn(b);return b;}
// pointer-tracked light on glass buttons, same as the extension
document.addEventListener('pointermove',e=>{const t=e.target.closest?.('.btn, .icon-btn');if(!t)return;const r=t.getBoundingClientRect();t.style.setProperty('--mx',(e.clientX-r.left)+'px');t.style.setProperty('--my',(e.clientY-r.top)+'px');},{passive:true});

$('signIn').onclick=async()=>{
  const button=$('signIn');
  if(!$('email').value.trim()||!$('password').value){msg('Enter your owner email and password.');return;}
  setBusy(button,true);
  try{
    const {data,error}=await sb.auth.signInWithPassword({email:$('email').value.trim(),password:$('password').value});
    if(error)throw error;
    token=data.session.access_token;showAdmin();msg('Signed in. Loading account list…');await load();
  }catch(e){msg(e.message||'Sign-in failed.');}
  finally{setBusy(button,false,'Sign in to Admin');}
};
async function call(body){
  const r=await fetch(c.supabaseUrl+'/functions/v1/admin-users',{method:'POST',headers:{'Content-Type':'application/json','apikey':c.supabasePublishableKey,'Authorization':'Bearer '+token},body:JSON.stringify(body)});
  const d=await r.json().catch(()=>({}));
  if(!r.ok)throw new Error(d.error||d.message||'Admin request failed');
  return d;
}
async function runAction(button,body){
  button.disabled=true;const old=button.textContent;button.textContent='Working…';
  try{await call(body);await load();}catch(e){msg(e.message);}
  finally{button.disabled=false;button.textContent=old;}
}
function formatDate(v){
  if(!v)return 'Never';
  const d=new Date(v);if(Number.isNaN(d.getTime()))return 'Unknown';
  return d.toLocaleString(undefined,{month:'short',day:'numeric',year:'numeric'})+'\n'+d.toLocaleTimeString(undefined,{hour:'numeric',minute:'2-digit'});
}
function activityState(device){
  if(!device)return {label:'Never used',kind:'inactive'};
  if(!device.last_seen_at)return {label:'Registered',kind:'pending'};
  const age=Date.now()-new Date(device.last_seen_at).getTime();
  if(Number.isFinite(age)&&age>=0&&age<=10*60*1000)return {label:'Seen recently',kind:'active'};
  return {label:'Inactive',kind:'inactive'};
}
const statusOf=p=>String(p.approval_status||'pending').toLowerCase();
const deviceOf=p=>(rows.devices||[]).find(x=>x.user_id===p.user_id);
const esc=s=>String(s??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const utcDay=d=>d.toISOString().slice(0,10);
const lastDays=n=>{const out=[];for(let i=n-1;i>=0;i--){const d=new Date();d.setUTCDate(d.getUTCDate()-i);out.push({key:utcDay(d),date:d,today:i===0});}return out;};
const fmtDay=d=>d.toLocaleDateString(undefined,{month:'short',day:'numeric',timeZone:'UTC'});
// usage lookups
let byUser=new Map(),byDay=new Map();
function indexUsage(){
  byUser=new Map();byDay=new Map();
  for(const a of rows.activity||[]){
    const m=byUser.get(a.user_id)||new Map();m.set(String(a.day).slice(0,10),a.checks||0);byUser.set(a.user_id,m);
    const k=String(a.day).slice(0,10);byDay.set(k,(byDay.get(k)||0)+(a.checks||0));
  }
}
function usageOf(p){
  const m=byUser.get(p.user_id)||new Map(),d7=lastDays(7),d14=lastDays(14);
  const today=m.get(d7[6].key)||0;
  const week=d7.reduce((s,d)=>s+(m.get(d.key)||0),0);
  const activeDays=d7.filter(d=>(m.get(d.key)||0)>0).length;
  const series=d14.map(d=>({v:m.get(d.key)||0,today:d.today}));
  return {today,week,activeDays,series};
}
function renderStats(){
  const ps=rows.profiles||[];
  indexUsage();
  const us=ps.map(usageOf);
  $('sTotal').textContent=ps.length;
  const approved=ps.filter(p=>statusOf(p)==='approved').length,pending=ps.filter(p=>statusOf(p)==='pending').length;
  $('sTotalSub').textContent=approved+' approved, '+pending+' pending';
  const today=us.filter(u=>u.today>0).length,week=us.filter(u=>u.week>0).length;
  $('sToday').textContent=today;$('sWeek').textContent=week;
  $('sWeekSub').textContent=ps.length?Math.round(week/ps.length*100)+'% of accounts':'Last 7 days';
  $('sChecks').textContent=us.reduce((s,u)=>s+u.today,0);
  $('cAll').textContent=ps.length;$('cPending').textContent=pending;$('cApproved').textContent=approved;
  $('cBlocked').textContent=ps.filter(p=>['rejected','suspended'].includes(statusOf(p))).length;
  renderChart();renderTop(ps,us);
  $('usageHint').textContent=(rows.activity||[]).length?'A check is counted when a user opens the extension or uploads scan results. More checks means more use. Days use UTC.':'No usage recorded yet. Run the usage tracking migration once, then usage appears as people use the extension.';
}
function renderChart(){
  const days=lastDays(14),max=Math.max(1,...days.map(d=>byDay.get(d.key)||0));
  $('chart').innerHTML=days.map(d=>{const v=byDay.get(d.key)||0,h=v?Math.max(6,Math.round(v/max*118)):3;
    return `<div class="bar-col${d.today?' today':''}" title="${esc(fmtDay(d.date))}: ${v} checks"><span class="bar-val">${v||''}</span><div class="bar${v?'':' zero'}" style="height:${h}px"></div><span class="bar-lbl">${d.date.toLocaleDateString(undefined,{weekday:'narrow',timeZone:'UTC'})}<br>${d.date.getUTCDate()}</span></div>`;}).join('');
}
function renderTop(ps,us){
  const list=ps.map((p,i)=>({label:p.email||'Unknown account',count:us[i].week})).filter(r=>r.count>0).sort((a,b)=>b.count-a.count).slice(0,6);
  if(!list.length){$('top').innerHTML='<p class="hint" style="margin:0">No usage in the last 7 days.</p>';return;}
  const max=Math.max(...list.map(r=>r.count),1);
  $('top').innerHTML=list.map((r,i)=>`<div class="meter-row"><div class="meter-head"><span>${esc(r.label)}</span><strong>${r.count}</strong></div><div class="meter"><i style="width:${Math.max(4,Math.round(r.count/max*100))}%;--c:${i===0?'var(--green)':'var(--accent)'}"></i></div></div>`).join('');
}
function matches(p){
  const s=statusOf(p);
  if(filter==='pending'&&s!=='pending')return false;
  if(filter==='approved'&&s!=='approved')return false;
  if(filter==='blocked'&&!['rejected','suspended'].includes(s))return false;
  return !query||String(p.email||'').toLowerCase().includes(query);
}
function sorted(list){
  const out=[...list];
  if(sortBy==='usage')out.sort((a,b)=>usageOf(b).week-usageOf(a).week||usageOf(b).today-usageOf(a).today);
  if(sortBy==='seen')out.sort((a,b)=>new Date(deviceOf(b)?.last_seen_at||0)-new Date(deviceOf(a)?.last_seen_at||0));
  return out;
}
function usageCell(p){
  const u=usageOf(p),td=document.createElement('td');td.className='usage-cell';
  const max=Math.max(1,...u.series.map(x=>x.v));
  td.innerHTML=`<b>${u.today}</b> <span class="hint" style="margin:0">today</span><small>${u.week} this week, ${u.activeDays} active day${u.activeDays===1?'':'s'}</small><div class="spark" title="Checks per day, last 14 days">${u.series.map(x=>`<i class="${x.v?'on':''}${x.today?' today':''}" style="height:${x.v?Math.max(16,Math.round(x.v/max*100)):10}%"></i>`).join('')}</div>`;
  return td;
}
function renderRows(){
  const body=$('users');body.innerHTML='';
  const list=sorted((rows.profiles||[]).filter(matches));
  for(const p of list){
    const dev=deviceOf(p),s=statusOf(p),tr=document.createElement('tr');
    const email=document.createElement('td');email.className='who';email.textContent=p.email||'Unknown account';
    const joined=document.createElement('small');joined.textContent='Joined '+(p.created_at?new Date(p.created_at).toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'}):'unknown');email.append(joined);tr.append(email);
    const st=document.createElement('td');st.append(pill(s,s));tr.append(st);
    const dv=document.createElement('td');dv.append(pill(dev?(dev.active?'Active':'Revoked'):'Not registered',dev?(dev.active?'active':'revoked'):'pending'));tr.append(dv);
    tr.append(usageCell(p));
    const l=document.createElement('td');l.className='when';const a=activityState(dev);
    l.textContent=formatDate(dev?.last_seen_at);if(a.kind==='active'){const n=document.createElement('div');n.append(pill('Seen recently','active'));l.append(n);l.style.whiteSpace='normal';}tr.append(l);
    const act=document.createElement('td');const w=document.createElement('div');w.className='row-actions';
    const set=(label,value,klass)=>btn(label,klass,b=>runAction(b,{user_id:p.user_id,status:value}));
    if(s!=='approved')w.append(set(s==='pending'?'Approve':'Reactivate','approved','btn-secondary btn-good'));
    if(s==='pending')w.append(set('Reject','rejected','btn-danger'));
    if(s==='approved')w.append(set('Suspend','suspended','btn-danger'));
    w.append(btn('Reset device','btn-secondary',b=>runAction(b,{user_id:p.user_id,status:p.approval_status,release_device:true})));
    w.append(btn('Revoke device','btn-danger',b=>runAction(b,{user_id:p.user_id,status:p.approval_status,revoke_device:true})));
    act.append(w);tr.append(act);body.append(tr);
  }
  $('empty').hidden=!!list.length;
}
async function load(){
  try{
    const d=await call({action:'list'});
    rows={profiles:d.profiles||[],devices:d.devices||[],activity:d.activity||[]};
    renderStats();renderRows();
    msg('Loaded '+rows.profiles.length+' account(s). Activity updates when the extension checks account access.');
  }catch(e){msg(e.message);}
}
$('refresh').onclick=load;
$('signOut').onclick=async()=>{try{await sb.auth.signOut();}catch(_){}showLogin();msg('You have signed out.');};
$('password').addEventListener('keydown',e=>{if(e.key==='Enter')$('signIn').click();});
$('sort').addEventListener('change',e=>{sortBy=e.target.value;renderRows();});
$('filter').addEventListener('input',e=>{query=e.target.value.trim().toLowerCase();renderRows();});
$('chips').addEventListener('click',e=>{const b=e.target.closest('[data-f]');if(!b)return;filter=b.dataset.f;document.querySelectorAll('#chips .btn').forEach(x=>x.classList.toggle('is-on',x===b));renderRows();});
